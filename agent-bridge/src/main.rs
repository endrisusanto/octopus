mod protocol;
mod scanner;
mod updater;
mod verifier;
mod workflow;

use futures_util::{SinkExt, StreamExt};
use protocol::{DeviceInfo, IncomingMessage, OutgoingMessage};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};
use tokio::time::sleep;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BridgeConfig {
    pub pc_id: String,
    pub hub_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BridgeLiveStatus {
    pub pc_id: String,
    pub hub_url: String,
    pub is_connected: bool,
    pub device_count: usize,
    pub devices: Vec<DeviceInfo>,
    pub binary_count: usize,
}

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Mutex<BridgeConfig>>,
    pub status: Arc<Mutex<BridgeLiveStatus>>,
    pub restart_trigger: Arc<tokio::sync::Notify>,
}

fn get_config_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let base = env::var("APPDATA").unwrap_or_else(|_| "C:\\".to_string());
        PathBuf::from(base).join("octopus").join("bridge_config.json")
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        PathBuf::from(home).join(".config").join("octopus").join("bridge_config.json")
    }
}

fn load_initial_config() -> BridgeConfig {
    let config_path = get_config_path();
    if let Ok(content) = fs::read_to_string(&config_path) {
        if let Ok(cfg) = serde_json::from_str::<BridgeConfig>(&content) {
            return cfg;
        }
    }

    // Default configuration
    let default_pc_id = if let Ok(val) = env::var("PC_ID") {
        val
    } else {
        let os_name = if cfg!(target_os = "windows") { "win" } else { "ubuntu" };
        let host = match hostname::get() {
            Ok(h) => h.to_string_lossy().to_string(),
            Err(_) => "node-01".to_string(),
        };
        format!("{}-{}", os_name, host)
    };

    let default_hub_url = env::var("HUB_URL")
        .unwrap_or_else(|_| "ws://127.0.0.1:4000/ws/bridge".to_string());

    let cfg = BridgeConfig {
        pc_id: default_pc_id,
        hub_url: default_hub_url,
    };

    let _ = save_config_to_disk(&cfg);
    cfg
}

fn save_config_to_disk(cfg: &BridgeConfig) -> Result<(), String> {
    let path = get_config_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}

fn get_os_type() -> String {
    if cfg!(target_os = "windows") {
        "windows".to_string()
    } else {
        "ubuntu".to_string()
    }
}

fn load_rack_calibration() -> serde_json::Value {
    let path = PathBuf::from("/home/endri-pro/rack_matrix_calibration.json");
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            return val;
        }
    }
    serde_json::json!({
        "layout": [
            [1, 1, 0, 1, 1, 0, 1, 1],
            [1, 1, 0, 1, 1, 0, 1, 1],
            [1, 1, 0, 1, 1, 0, 1, 1]
        ],
        "rows": 3,
        "cols": 8,
        "slots": []
    })
}

fn save_rack_calibration(calib: &serde_json::Value) -> Result<(), String> {
    let path = PathBuf::from("/home/endri-pro/rack_matrix_calibration.json");
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let s = serde_json::to_string_pretty(calib).map_err(|e| e.to_string())?;
    fs::write(path, s).map_err(|e| e.to_string())?;
    Ok(())
}

// Background Worker Task
async fn run_bridge_worker(state: AppState) {
    let os_type = get_os_type();

    loop {
        let (current_hub_url, current_pc_id) = {
            let cfg = state.config.lock().unwrap();
            (cfg.hub_url.clone(), cfg.pc_id.clone())
        };

        {
            let mut st = state.status.lock().unwrap();
            st.hub_url = current_hub_url.clone();
            st.pc_id = current_pc_id.clone();
            st.is_connected = false;
        }

        println!("[Bridge] Connecting to Hub: {} as PC ID: {} ...", current_hub_url, current_pc_id);

        match connect_async(&current_hub_url).await {
            Ok((ws_stream, _)) => {
                println!("[Bridge] Connected successfully! Registered as {}", current_pc_id);
                {
                    let mut st = state.status.lock().unwrap();
                    st.is_connected = true;
                }

                let (mut write, mut read) = ws_stream.split();

                // 1. Send Register Message
                let reg_msg = OutgoingMessage::Register {
                    pc_id: current_pc_id.clone(),
                    os: os_type.clone(),
                };
                if let Ok(json) = serde_json::to_string(&reg_msg) {
                    let _ = write.send(Message::Text(json.into())).await;
                }

                // 1b. Send Initial Rack Calibration Sync
                let calib = load_rack_calibration();
                let calib_msg = OutgoingMessage::RackCalibrationSync { calibration: calib };
                if let Ok(json) = serde_json::to_string(&calib_msg) {
                    let _ = write.send(Message::Text(json.into())).await;
                }

                // 2. Spawn device & binary scanner loop
                let (tx, mut rx) = tokio::sync::mpsc::channel::<OutgoingMessage>(32);
                let active_verifications: Arc<Mutex<HashMap<String, (u64, tokio::task::JoinHandle<()>)>>> = Arc::new(Mutex::new(HashMap::new()));
                let verif_counter = Arc::new(std::sync::atomic::AtomicU64::new(1));
                let scanner_state = state.clone();
                let tx_scanner = tx.clone();

                let scanner_handle = tokio::spawn(async move {
                    let mut tick: u32 = 0;
                    loop {
                        let devices = scanner::scan_all_devices();
                        let dev_count = devices.len();

                        {
                            let mut st = scanner_state.status.lock().unwrap();
                            st.device_count = dev_count;
                            st.devices = devices.clone();
                        }

                        let update = OutgoingMessage::DeviceList { devices };
                        if tx_scanner.send(update).await.is_err() {
                            break;
                        }

                        // Periodic binary scan (every 10s)
                        if tick % 5 == 0 {
                            let binaries = scanner::scan_local_binaries(None);
                            {
                                let mut st = scanner_state.status.lock().unwrap();
                                st.binary_count = binaries.len();
                            }
                            let bin_update = OutgoingMessage::BinaryList { binaries };
                            let _ = tx_scanner.send(bin_update).await;
                        }
                        tick = tick.wrapping_add(1);

                        sleep(Duration::from_secs(2)).await;
                    }
                });

                // 3. Message forwarding loop
                loop {
                    tokio::select! {
                        _ = state.restart_trigger.notified() => {
                            println!("[Bridge] Config updated. Reconnecting...");
                            break;
                        }
                        Some(out_msg) = rx.recv() => {
                            if let Ok(json) = serde_json::to_string(&out_msg) {
                                if write.send(Message::Text(json.into())).await.is_err() {
                                    break;
                                }
                            }
                        }
                        Some(msg_result) = read.next() => {
                            match msg_result {
                                Ok(Message::Text(text)) => {
                                    if let Ok(incoming) = serde_json::from_str::<IncomingMessage>(&text) {
                                        match incoming {
                                            IncomingMessage::Execute(exec) => {
                                                println!("[Command] Target Device: {}, Action: {}", exec.device_id, exec.action);
                                                 if exec.action == "SELF_UPDATE" || exec.action == "UPDATE_AGENT" {
                                                    let repo = "endrisusanto/octopus";
                                                    let target_ver = exec.params
                                                        .as_ref()
                                                        .and_then(|p| p.get("targetVersion"))
                                                        .and_then(|v| v.as_str())
                                                        .unwrap_or("latest");
                                                    let res = updater::trigger_silent_update(repo, target_ver).await;
                                                    let log_msg = OutgoingMessage::LogStream {
                                                        device_id: None,
                                                        level: if res.success { "info".to_string() } else { "error".to_string() },
                                                        message: format!("[Updater] {}", res.message),
                                                    };
                                                    if let Ok(json) = serde_json::to_string(&log_msg) {
                                                        let _ = write.send(Message::Text(json.into())).await;
                                                    }
                                                } else if exec.action == "RELOAD_DEVICES" || exec.action == "RELOAD_UDEV_AND_ADB" || exec.action == "reload_udev_and_adb" {
                                                    let out = scanner::reload_udev_and_adb();
                                                    let devs = scanner::scan_all_devices();
                                                    let list_msg = OutgoingMessage::DeviceList { devices: devs };
                                                    let log_msg = OutgoingMessage::LogStream {
                                                        device_id: None,
                                                        level: "info".to_string(),
                                                        message: format!("[Bridge] 🔄 Udev rules reloaded & ADB refreshed:\n{}", out.trim()),
                                                    };
                                                    if let Ok(json) = serde_json::to_string(&list_msg) {
                                                        let _ = write.send(Message::Text(json.into())).await;
                                                    }
                                                    if let Ok(json) = serde_json::to_string(&log_msg) {
                                                        let _ = write.send(Message::Text(json.into())).await;
                                                    }
                                                } else if exec.action == "TOGGLE_TORCH"
                                                    || exec.action == "SET_TORCH"
                                                    || exec.action == "TORCH_ON"
                                                    || exec.action == "TORCH_OFF"
                                                    || exec.action == "BULK_TORCH"
                                                    || exec.action == "TORCH_ALL_OFF"
                                                    || exec.action == "TORCH_ALL_ON"
                                                {
                                                    let serial = exec.device_id.clone();
                                                    let is_all = serial == "ALL" || serial.is_empty() || exec.action == "TORCH_ALL_OFF" || exec.action == "TORCH_ALL_ON";
                                                    
                                                    // Parse target state: "on", "off", or toggle
                                                    let target_state = if exec.action == "TORCH_ON" || exec.action == "TORCH_ALL_ON" {
                                                        "on".to_string()
                                                    } else if exec.action == "TORCH_OFF" || exec.action == "TORCH_ALL_OFF" {
                                                        "off".to_string()
                                                    } else if let Some(st) = exec.params.as_ref().and_then(|p| p.get("state")).and_then(|v| v.as_str()) {
                                                        st.to_string()
                                                    } else {
                                                        "toggle".to_string()
                                                    };

                                                    // Extract device list if provided in params
                                                    let target_devs: Vec<String> = if let Some(params) = &exec.params {
                                                        if let Some(arr) = params.get("deviceIds").or_else(|| params.get("devices")).and_then(|v| v.as_array()) {
                                                            arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()
                                                        } else if let Some(s) = params.get("devices").or_else(|| params.get("deviceIds")).and_then(|v| v.as_str()) {
                                                            s.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect()
                                                        } else if !serial.is_empty() && serial != "ALL" {
                                                            vec![serial.clone()]
                                                        } else {
                                                            Vec::new()
                                                        }
                                                    } else if !serial.is_empty() && serial != "ALL" {
                                                        vec![serial.clone()]
                                                    } else {
                                                        Vec::new()
                                                    };

                                                    // If turning off all, also terminate running_led animation
                                                    if target_state == "off" || is_all {
                                                        let _ = Command::new("pkill").args(["-f", "running_led.py"]).output();
                                                    }

                                                    // Immediate UI log feedback (0ms latency)
                                                    let log_msg = OutgoingMessage::LogStream {
                                                        device_id: if target_devs.len() == 1 { Some(target_devs[0].clone()) } else { None },
                                                        level: "info".to_string(),
                                                        message: if is_all || target_devs.is_empty() {
                                                            format!("[Senter] Memproses senter SEMUA perangkat ke status: {}", target_state.to_uppercase())
                                                        } else {
                                                            format!("[Senter] Memproses senter ({} perangkat) ke status: {}", target_devs.len(), target_state.to_uppercase())
                                                        },
                                                    };
                                                    if let Ok(json) = serde_json::to_string(&log_msg) {
                                                        let _ = write.send(Message::Text(json.into())).await;
                                                    }

                                                    // Spawn background task for fast parallel Python execution and immediate verified status broadcast
                                                    let tx_torch = tx.clone();
                                                    let scanner_state_torch = state.clone();
                                                    tokio::task::spawn(async move {
                                                        let state_arg = if target_state == "toggle" {
                                                            if target_devs.len() == 1 {
                                                                let curr = tokio::process::Command::new("adb")
                                                                    .args(["-s", &target_devs[0], "shell", "settings", "get", "secure", "flashlight_enabled"])
                                                                    .output()
                                                                    .await
                                                                    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                                                                    .unwrap_or_default();
                                                                if curr == "1" { "off" } else { "on" }
                                                            } else {
                                                                "on"
                                                            }
                                                        } else {
                                                            &target_state
                                                        };

                                                        let mut cmd = tokio::process::Command::new("python3");
                                                        cmd.arg("/home/endri-pro/led.py").arg(state_arg);
                                                        if !target_devs.is_empty() {
                                                            cmd.arg(target_devs.join(","));
                                                        }
                                                        let _ = cmd.current_dir("/home/endri-pro").output().await;

                                                        // Query actual status directly from physical devices via ADB
                                                        let check_targets = if target_devs.is_empty() {
                                                            let st = scanner_state_torch.status.lock().unwrap();
                                                            st.devices.iter().filter_map(|d| d.serial.clone()).collect::<Vec<_>>()
                                                        } else {
                                                            target_devs.clone()
                                                        };

                                                        for serial in check_targets {
                                                            let out = tokio::process::Command::new("adb")
                                                                .args(["-s", &serial, "shell", "settings", "get", "secure", "flashlight_enabled"])
                                                                .output()
                                                                .await
                                                                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                                                                .unwrap_or_default();
                                                            let is_on = out == "1";

                                                            {
                                                                let mut st = scanner_state_torch.status.lock().unwrap();
                                                                for d in &mut st.devices {
                                                                    if d.id == serial || d.serial.as_deref() == Some(&serial) {
                                                                        d.torch_on = Some(is_on);
                                                                    }
                                                                }
                                                            }

                                                            let _ = tx_torch.send(OutgoingMessage::TorchStatusUpdate {
                                                                device_id: serial,
                                                                torch_on: is_on,
                                                            }).await;
                                                        }

                                                        let devices = {
                                                            let st = scanner_state_torch.status.lock().unwrap();
                                                            st.devices.clone()
                                                        };
                                                        let _ = tx_torch.send(OutgoingMessage::DeviceList { devices }).await;
                                                    });
                                                } else if exec.action == "RUN_LED_ANIM" || exec.action == "RUNNING_LED" {
                                                    let preset = exec.params
                                                        .as_ref()
                                                        .and_then(|p| p.get("preset"))
                                                        .and_then(|v| v.as_str())
                                                        .unwrap_or("all")
                                                        .to_string();
                                                    let is_loop = exec.params
                                                        .as_ref()
                                                        .and_then(|p| p.get("loop").or_else(|| p.get("isLoop")))
                                                        .and_then(|v| v.as_bool())
                                                        .unwrap_or(false);

                                                    // Terminate previous running animation forcefully
                                                    let _ = Command::new("pkill").args(["-9", "-f", "running_led.py"]).output();
                                                    tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;

                                                    // Acuan selalu dari preset rak kalibrasi (abaikan device selection)
                                                    let mut py_args = vec!["/home/endri-pro/running_led.py".to_string(), "--preset".to_string(), preset.clone()];
                                                    if is_loop {
                                                        py_args.push("--loop".to_string());
                                                    }

                                                    tokio::task::spawn_blocking(move || {
                                                        let _ = Command::new("python3")
                                                            .args(&py_args)
                                                            .current_dir("/home/endri-pro")
                                                            .spawn();
                                                    });

                                                    let log_msg = OutgoingMessage::LogStream {
                                                        device_id: None,
                                                        level: "info".to_string(),
                                                        message: format!("[Running LED] 🎆 Memulai preset animasi '{}' (Loop: {}) [Rak Kalibrasi]", preset, if is_loop { "Ya" } else { "Tidak" }),
                                                    };
                                                    if let Ok(json) = serde_json::to_string(&log_msg) {
                                                        let _ = write.send(Message::Text(json.into())).await;
                                                    }
                                                } else if exec.action == "STOP_LED_ANIM" {
                                                    // Forcefully kill any running animation python process
                                                    let _ = Command::new("pkill").args(["-9", "-f", "running_led.py"]).output();

                                                    // Turn off all physical flashlights and synchronize state
                                                    let tx_torch = tx.clone();
                                                    let scanner_state_torch = state.clone();
                                                    tokio::task::spawn(async move {
                                                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                                                        // Broadcast off to all connected devices via led.py off
                                                        let _ = tokio::process::Command::new("python3")
                                                            .args(["/home/endri-pro/led.py", "off"])
                                                            .current_dir("/home/endri-pro")
                                                            .output()
                                                            .await;

                                                        let all_serials = {
                                                            let mut st = scanner_state_torch.status.lock().unwrap();
                                                            for d in &mut st.devices {
                                                                d.torch_on = Some(false);
                                                            }
                                                            st.devices.iter().filter_map(|d| d.serial.clone()).collect::<Vec<_>>()
                                                        };

                                                        for serial in &all_serials {
                                                            let _ = tx_torch.send(OutgoingMessage::TorchStatusUpdate {
                                                                device_id: serial.clone(),
                                                                torch_on: false,
                                                            }).await;
                                                        }

                                                        let devices = {
                                                            let st = scanner_state_torch.status.lock().unwrap();
                                                            st.devices.clone()
                                                        };
                                                        let _ = tx_torch.send(OutgoingMessage::DeviceList { devices }).await;
                                                    });

                                                    let log_msg = OutgoingMessage::LogStream {
                                                        device_id: None,
                                                        level: "info".to_string(),
                                                        message: "[Running LED] ⏹️ Animasi dihentikan & semua senter fisik dimatikan (broadcast off).".to_string(),
                                                    };
                                                    if let Ok(json) = serde_json::to_string(&log_msg) {
                                                        let _ = write.send(Message::Text(json.into())).await;
                                                    }
                                                } else if exec.action == "GET_RACK_CALIBRATION" {
                                                    let calib = load_rack_calibration();
                                                    let calib_msg = OutgoingMessage::RackCalibrationSync { calibration: calib };
                                                    if let Ok(json) = serde_json::to_string(&calib_msg) {
                                                        let _ = write.send(Message::Text(json.into())).await;
                                                    }
                                                } else if exec.action == "SAVE_RACK_CALIBRATION" {
                                                    let calib_val = exec.params
                                                        .as_ref()
                                                        .and_then(|p| p.get("calibration"))
                                                        .cloned()
                                                        .unwrap_or_else(|| exec.params.clone().unwrap_or(serde_json::Value::Null));

                                                    if calib_val.is_object() {
                                                        let _ = save_rack_calibration(&calib_val);
                                                        let calib_msg = OutgoingMessage::RackCalibrationSync { calibration: calib_val };
                                                        if let Ok(json) = serde_json::to_string(&calib_msg) {
                                                            let _ = write.send(Message::Text(json.into())).await;
                                                        }
                                                        let log_msg = OutgoingMessage::LogStream {
                                                            device_id: None,
                                                            level: "info".to_string(),
                                                            message: "[Kalibrasi Rak] 💾 Konfigurasi posisi fisik 6x3 berhasil disimpan.".to_string(),
                                                        };
                                                        if let Ok(json) = serde_json::to_string(&log_msg) {
                                                            let _ = write.send(Message::Text(json.into())).await;
                                                        }
                                                    }
                                                } else if exec.action == "BLINK_SLOT" || exec.action == "BLINK_DEVICE" {
                                                    let serial = exec.device_id.clone();
                                                    let b_serial = serial.clone();
                                                    tokio::task::spawn_blocking(move || {
                                                        let _ = Command::new("python3").args(["/home/endri-pro/led.py", "on", &b_serial]).output();
                                                        std::thread::sleep(std::time::Duration::from_millis(1500));
                                                        let _ = Command::new("python3").args(["/home/endri-pro/led.py", "off", &b_serial]).output();
                                                    });
                                                    let log_msg = OutgoingMessage::LogStream {
                                                        device_id: Some(serial.clone()),
                                                        level: "info".to_string(),
                                                        message: format!("[Kalibrasi Rak] 💡 Mengedipkan senter perangkat {}", serial),
                                                    };
                                                    if let Ok(json) = serde_json::to_string(&log_msg) {
                                                        let _ = write.send(Message::Text(json.into())).await;
                                                    }
                                                } else if exec.action == "REBOOT" || exec.action == "reboot" || exec.action == "REBOOT_DOWNLOAD" || exec.action == "reboot_download" || exec.action == "REBOOT_RECOVERY" || exec.action == "reboot_recovery" {
                                                    let serial = exec.device_id.clone();
                                                    let reboot_arg: Vec<String> = if exec.action == "REBOOT_DOWNLOAD" || exec.action == "reboot_download" {
                                                        vec!["-s".to_string(), serial.clone(), "reboot".to_string(), "download".to_string()]
                                                    } else if exec.action == "REBOOT_RECOVERY" || exec.action == "reboot_recovery" {
                                                        vec!["-s".to_string(), serial.clone(), "reboot".to_string(), "recovery".to_string()]
                                                    } else {
                                                        vec!["-s".to_string(), serial.clone(), "reboot".to_string()]
                                                    };

                                                    let target_mode = reboot_arg.last().cloned().unwrap_or_else(|| "system".to_string());
                                                    let serial_clone = serial.clone();
                                                    let target_mode_clone = target_mode.clone();
                                                    let tx_reboot = tx.clone();

                                                    tokio::spawn(async move {
                                                        // 1. Dispatch adb reboot asynchronously
                                                        let _ = tokio::task::spawn_blocking({
                                                            let reboot_arg = reboot_arg.clone();
                                                            move || {
                                                                let _ = Command::new("adb").args(&reboot_arg).output();
                                                            }
                                                        }).await;

                                                        // 2. If it is a normal system reboot, monitor until device is verified back online
                                                        if target_mode_clone == "system" || target_mode_clone == "reboot" {
                                                            tokio::time::sleep(tokio::time::Duration::from_secs(4)).await;
                                                            let start_time = std::time::Instant::now();
                                                            let mut verified = false;

                                                            while start_time.elapsed() < std::time::Duration::from_secs(75) {
                                                                let s_chk = serial_clone.clone();
                                                                let is_online = tokio::task::spawn_blocking(move || {
                                                                    let out = Command::new("adb").args(["-s", &s_chk, "get-state"]).output();
                                                                    if let Ok(o) = out {
                                                                        let st = String::from_utf8_lossy(&o.stdout).trim().to_string();
                                                                        st == "device"
                                                                    } else {
                                                                        false
                                                                    }
                                                                }).await.unwrap_or(false);

                                                                if is_online {
                                                                    verified = true;
                                                                    break;
                                                                }
                                                                tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
                                                            }

                                                            if verified {
                                                                let _ = tx_reboot.send(OutgoingMessage::LogStream {
                                                                    device_id: Some(serial_clone.clone()),
                                                                    level: "info".to_string(),
                                                                    message: format!("[Reboot] ✅ Perangkat {} berhasil reboot dan kembali online (Ready)", serial_clone),
                                                                }).await;
                                                                let _ = tx_reboot.send(OutgoingMessage::DeviceProgress {
                                                                    device_id: serial_clone,
                                                                    progress: 100,
                                                                    status: Some("Ready".to_string()),
                                                                    current_task: None,
                                                                }).await;
                                                            }
                                                        }
                                                    });

                                                    let log_msg = OutgoingMessage::LogStream {
                                                        device_id: Some(serial.clone()),
                                                        level: "info".to_string(),
                                                        message: format!("[Reboot] Mengirim perintah reboot ({}) ke {}", target_mode, serial),
                                                    };
                                                    if let Ok(json) = serde_json::to_string(&log_msg) {
                                                        let _ = write.send(Message::Text(json.into())).await;
                                                    }
                                                } else if exec.action == "VERIFY_MD5" {
                                                    let slot_key = exec.params
                                                        .as_ref()
                                                        .and_then(|p| p.get("slotKey"))
                                                        .and_then(|v| v.as_str())
                                                        .unwrap_or("ap")
                                                        .to_string();
                                                    let file_path = exec.params
                                                        .as_ref()
                                                        .and_then(|p| p.get("path"))
                                                        .and_then(|v| v.as_str())
                                                        .unwrap_or("")
                                                        .to_string();
                                                    let filename = exec.params
                                                        .as_ref()
                                                        .and_then(|p| p.get("filename"))
                                                        .and_then(|v| v.as_str())
                                                        .unwrap_or("")
                                                        .to_string();

                                                    // Cancel / abort previous verification task for this slot if running
                                                    let task_id = verif_counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                                                    {
                                                        let mut verifs = active_verifications.lock().unwrap();
                                                        if let Some((_, prev_handle)) = verifs.remove(&slot_key) {
                                                            println!("[Verifier] Aborting previous MD5 verification for slot: {}", slot_key);
                                                            prev_handle.abort();
                                                        }
                                                    }

                                                    let tx_md5 = tx.clone();
                                                    let verifs_ref = active_verifications.clone();
                                                    let s_key = slot_key.clone();

                                                    let handle = tokio::spawn(async move {
                                                        verifier::verify_firmware_md5_task(s_key.clone(), file_path, filename, tx_md5).await;
                                                        let mut verifs = verifs_ref.lock().unwrap();
                                                        if let Some((curr_id, _)) = verifs.get(&s_key) {
                                                            if *curr_id == task_id {
                                                                verifs.remove(&s_key);
                                                            }
                                                        }
                                                    });

                                                    {
                                                        let mut verifs = active_verifications.lock().unwrap();
                                                        verifs.insert(slot_key, (task_id, handle));
                                                    }
                                                } else if exec.action == "CANCEL_VERIFY_MD5" || exec.action == "ABORT_MD5" {
                                                    let slot_key = exec.params
                                                        .as_ref()
                                                        .and_then(|p| p.get("slotKey"))
                                                        .and_then(|v| v.as_str())
                                                        .unwrap_or("all")
                                                        .to_string();

                                                    let mut verifs = active_verifications.lock().unwrap();
                                                    if slot_key == "all" {
                                                        for (k, (_, handle)) in verifs.drain() {
                                                            println!("[Verifier] Aborting MD5 verification for slot: {}", k);
                                                            handle.abort();
                                                        }
                                                    } else if let Some((_, handle)) = verifs.remove(&slot_key) {
                                                        println!("[Verifier] Aborting MD5 verification for slot: {}", slot_key);
                                                        handle.abort();
                                                    }
                                                } else if exec.action == "WORKFLOW_PIPELINE"
                                                    || exec.action == "suw_bypass"
                                                    || exec.action == "setup_gba"
                                                    || exec.action == "wifi_connect"
                                                    || exec.action == "flash"
                                                    || exec.action == "FLASH_ODIN"
                                                {
                                                    let odin_flash = if exec.action == "flash" || exec.action == "FLASH_ODIN" {
                                                        true
                                                    } else {
                                                        exec.params
                                                            .as_ref()
                                                            .and_then(|p| {
                                                                p.get("odinFlash")
                                                                    .and_then(|v| v.as_bool().or_else(|| v.as_str().map(|s| s == "true" || s == "1")))
                                                            })
                                                            .unwrap_or(true)
                                                    };
                                                    let ap_path = exec.params
                                                        .as_ref()
                                                        .and_then(|p| {
                                                            p.get("apPath")
                                                                .or_else(|| p.get("apFilename"))
                                                                .or_else(|| p.get("binaryFile"))
                                                        })
                                                        .and_then(|v| v.as_str())
                                                        .unwrap_or("")
                                                        .to_string();
                                                    let bl_path = exec.params
                                                        .as_ref()
                                                        .and_then(|p| p.get("blPath"))
                                                        .and_then(|v| v.as_str())
                                                        .unwrap_or("")
                                                        .to_string();
                                                    let cp_path = exec.params
                                                        .as_ref()
                                                        .and_then(|p| p.get("cpPath"))
                                                        .and_then(|v| v.as_str())
                                                        .unwrap_or("")
                                                        .to_string();
                                                    let csc_path = exec.params
                                                        .as_ref()
                                                        .and_then(|p| p.get("cscPath"))
                                                        .and_then(|v| v.as_str())
                                                        .unwrap_or("")
                                                        .to_string();
                                                    let userdata_path = exec.params
                                                        .as_ref()
                                                        .and_then(|p| p.get("userdataPath"))
                                                        .and_then(|v| v.as_str())
                                                        .unwrap_or("")
                                                        .to_string();

                                                    let skip_suw = if exec.action == "suw_bypass" {
                                                        true
                                                    } else {
                                                        exec.params
                                                            .as_ref()
                                                            .and_then(|p| p.get("skipSuw"))
                                                            .and_then(|v| v.as_bool())
                                                            .unwrap_or(true)
                                                    };
                                                    let setup_gba = if exec.action == "setup_gba" {
                                                        true
                                                    } else {
                                                        exec.params
                                                            .as_ref()
                                                            .and_then(|p| p.get("setupGba"))
                                                            .and_then(|v| v.as_bool())
                                                            .unwrap_or(true)
                                                    };
                                                    let wifi_enabled = if exec.action == "wifi_connect" {
                                                        true
                                                    } else {
                                                        exec.params
                                                            .as_ref()
                                                            .and_then(|p| p.get("wifiEnabled"))
                                                            .and_then(|v| v.as_bool())
                                                            .unwrap_or(true)
                                                    };
                                                    let wifi_ssid = exec.params
                                                        .as_ref()
                                                        .and_then(|p| p.get("wifiSsid"))
                                                        .and_then(|v| v.as_str())
                                                        .unwrap_or("RTT / IEEE 802.11")
                                                        .to_string();
                                                    let wifi_password = exec.params
                                                        .as_ref()
                                                        .and_then(|p| p.get("wifiPassword"))
                                                        .and_then(|v| v.as_str())
                                                        .unwrap_or("1234qwer")
                                                        .to_string();
                                                    let post_torch = exec.params
                                                        .as_ref()
                                                        .and_then(|p| p.get("postTorch").or_else(|| p.get("autoTorchOn")))
                                                        .and_then(|v| v.as_bool().or_else(|| v.as_str().map(|s| s == "true" || s == "1")))
                                                        .unwrap_or(true);

                                                    let device_id = exec.device_id.clone();
                                                    // Find serial and usb port if device_id is port devnode
                                                    let (serial_hint, port_hint, mode_hint) = {
                                                        let st = state.status.lock().unwrap();
                                                        let dev = st.devices.iter().find(|d| d.id == device_id || d.serial.as_deref() == Some(&device_id));
                                                        (
                                                            dev.and_then(|d| d.serial.clone()),
                                                            dev.map(|d| d.port.clone()),
                                                            dev.map(|d| d.mode.clone()),
                                                        )
                                                    };

                                                    let tx_wf = tx.clone();
                                                    tokio::spawn(async move {
                                                        workflow::execute_workflow_pipeline(
                                                            device_id,
                                                            serial_hint,
                                                            port_hint,
                                                            mode_hint,
                                                            odin_flash,
                                                            ap_path,
                                                            bl_path,
                                                            cp_path,
                                                            csc_path,
                                                            userdata_path,
                                                            skip_suw,
                                                            setup_gba,
                                                            wifi_enabled,
                                                            wifi_ssid,
                                                            wifi_password,
                                                            post_torch,
                                                            tx_wf,
                                                        ).await;
                                                    });
                                                }
                                            }
                                        }
                                    }
                                }
                                Ok(Message::Close(_)) | Err(_) => {
                                    println!("[Bridge] Hub connection closed");
                                    break;
                                }
                                _ => {}
                            }
                        }
                    }
                }

                scanner_handle.abort();
                {
                    let mut st = state.status.lock().unwrap();
                    st.is_connected = false;
                }
            }
            Err(err) => {
                // Check if local devices exist even when offline
                let devices = scanner::scan_all_devices();
                {
                    let mut st = state.status.lock().unwrap();
                    st.is_connected = false;
                    st.device_count = devices.len();
                    st.devices = devices;
                }
                eprintln!("[Bridge] Connection failed: {}. Retrying in 3 seconds...", err);
            }
        }

        tokio::select! {
            _ = state.restart_trigger.notified() => {
                println!("[Bridge] Reconnect triggered by config change");
            }
            _ = sleep(Duration::from_secs(3)) => {}
        }
    }
}

// Tauri IPC Commands
#[tauri::command]
fn get_bridge_status(state: tauri::State<AppState>) -> BridgeLiveStatus {
    state.status.lock().unwrap().clone()
}

#[tauri::command]
fn save_bridge_config(
    pc_id: String,
    hub_url: String,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let clean_pc = pc_id.trim().to_string();
    let clean_url = hub_url.trim().to_string();

    if clean_pc.is_empty() {
        return Err("PC ID tidak boleh kosong".to_string());
    }
    if clean_url.is_empty() {
        return Err("Hub URL tidak boleh kosong".to_string());
    }

    let new_cfg = BridgeConfig {
        pc_id: clean_pc,
        hub_url: clean_url,
    };

    save_config_to_disk(&new_cfg)?;

    {
        let mut cfg = state.config.lock().unwrap();
        *cfg = new_cfg;
    }

    // Trigger immediate reconnect
    state.restart_trigger.notify_one();
    Ok(())
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let is_headless = args.iter().any(|a| a == "--headless" || a == "-d");

    let initial_config = load_initial_config();
    let app_state = AppState {
        config: Arc::new(Mutex::new(initial_config.clone())),
        status: Arc::new(Mutex::new(BridgeLiveStatus {
            pc_id: initial_config.pc_id.clone(),
            hub_url: initial_config.hub_url.clone(),
            is_connected: false,
            device_count: 0,
            devices: Vec::new(),
            binary_count: 0,
        })),
        restart_trigger: Arc::new(tokio::sync::Notify::new()),
    };

    println!("==================================================");
    println!(" Octopus Lightweight Agent Bridge");
    println!(" PC ID:   {}", initial_config.pc_id);
    println!(" Hub URL: {}", initial_config.hub_url);
    println!(" Mode:    {}", if is_headless { "Headless Daemon" } else { "Tauri Desktop with AppTray" });
    println!("==================================================");

    if is_headless {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(run_bridge_worker(app_state));
        return;
    }

    // Spawn async background worker thread for Tauri app
    let worker_state = app_state.clone();
    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(run_bridge_worker(worker_state));
    });

    // Start Tauri Desktop App with System Tray & Close-to-Tray Prevention
    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![get_bridge_status, save_bridge_config])
        .setup(|app| {
            let status_item = MenuItem::with_id(app, "status", "Octopus Agent Bridge Active", false, None::<&str>)?;
            let show_item = MenuItem::with_id(app, "show", "Show Bridge Window", true, None::<&str>)?;
            let web_item = MenuItem::with_id(app, "web", "Open Web Hub", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Bridge", true, None::<&str>)?;

            let tray_menu = Menu::with_items(app, &[&status_item, &show_item, &web_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::with_id("main_tray")
                .menu(&tray_menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "web" => {
                        let _ = open::that("https://octopus.endrisusanto.my.id");
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _ = tray_builder.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // ponytail: Prevent accidental window close -> minimize to system tray instead
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                println!("[Tray] Bridge window hidden to system tray. Worker continues running in background.");
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
