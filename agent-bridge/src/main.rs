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
