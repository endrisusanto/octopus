use crate::protocol::{BinaryFileInfo, DeviceInfo};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;

static PORT_HISTORY: Mutex<Option<HashMap<String, (String, String)>>> = Mutex::new(None);

pub fn update_port_history(port: &str, serial: &str, model: &str) {
    let clean = port.trim().trim_start_matches("USB:").trim_start_matches("usb:").to_string();
    if clean.is_empty() || serial.is_empty() {
        return;
    }
    if let Ok(mut lock) = PORT_HISTORY.lock() {
        let map = lock.get_or_insert_with(HashMap::new);
        map.insert(clean.clone(), (serial.to_string(), model.to_string()));
        map.insert(port.to_string(), (serial.to_string(), model.to_string()));
    }
}

pub fn get_port_history(port: &str) -> Option<(String, String)> {
    let clean = port.trim().trim_start_matches("USB:").trim_start_matches("usb:");
    if let Ok(lock) = PORT_HISTORY.lock() {
        if let Some(map) = lock.as_ref() {
            if let Some(res) = map.get(clean) {
                return Some(res.clone());
            }
            if let Some(res) = map.get(port) {
                return Some(res.clone());
            }
        }
    }
    None
}

// ponytail: Reload system udev rules and safe refresh ADB devices (matching FlashKit)
pub fn reload_udev_and_adb() -> String {
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("sudo").args(["udevadm", "control", "--reload-rules"]).output();
        let _ = Command::new("sudo").args(["udevadm", "trigger"]).output();
        let _ = Command::new("udevadm").args(["control", "--reload-rules"]).output();
        let _ = Command::new("udevadm").args(["trigger"]).output();
    }

    let output = Command::new("adb").arg("devices").output();
    match output {
        Ok(out) => String::from_utf8_lossy(&out.stdout).to_string(),
        Err(e) => format!("Error refreshing ADB: {}", e),
    }
}

// ponytail: Recursive helper with depth limiting to fast-scan mounted drives
fn scan_dir_recursive(
    dir: &std::path::Path,
    current_depth: usize,
    max_depth: usize,
    results: &mut Vec<BinaryFileInfo>,
) {
    if current_depth > max_depth {
        return;
    }

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden directories, recycle bins, and irrelevant test/cache dirs
            if file_name.starts_with('.')
                || file_name.starts_with('$')
                || file_name == "lost+found"
                || file_name == "node_modules"
                || file_name == "testcases"
                || file_name == "System Volume Information"
            {
                continue;
            }

            if path.is_dir() {
                scan_dir_recursive(&path, current_depth + 1, max_depth, results);
            } else if path.is_file() {
                let name_lower = file_name.to_lowercase();
                let is_fw = name_lower.ends_with(".tar.md5")
                    || name_lower.ends_with(".tar")
                    || name_lower.ends_with(".bin")
                    || name_lower.ends_with(".img")
                    || name_lower.ends_with(".lz4")
                    || (name_lower.ends_with(".zip") && (file_name.starts_with("AP_") || file_name.starts_with("ALL_") || file_name.starts_with("BL_") || file_name.starts_with("CP_") || file_name.starts_with("CSC_") || file_name.starts_with("HOME_CSC_") || file_name.starts_with("SM-") || file_name.starts_with("SM_") || file_name.contains("Firmware") || file_name.contains("firmware") || file_name.contains("ROM") || file_name.contains("rom")))
                    || file_name.starts_with("AP_")
                    || file_name.starts_with("ALL_")
                    || file_name.starts_with("BL_")
                    || file_name.starts_with("CP_")
                    || file_name.starts_with("CSC_")
                    || file_name.starts_with("HOME_CSC_")
                    || file_name.starts_with("COMBINATION_")
                    || file_name.starts_with("USERDATA_");

                if is_fw {
                    let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    results.push(BinaryFileInfo {
                        filename: file_name,
                        path: path.to_string_lossy().to_string(),
                        size_bytes,
                    });
                }
            }
        }
    }
}

// ponytail: Scan local binary & mounted external drive directories on Bridge PC
pub fn scan_local_binaries(custom_dir: Option<&str>) -> Vec<BinaryFileInfo> {
    let mut results = Vec::new();
    let mut candidate_roots: Vec<PathBuf> = Vec::new();

    if let Some(dir) = custom_dir {
        candidate_roots.push(PathBuf::from(dir));
    }

    if let Ok(env_dir) = std::env::var("OCTOPUS_FIRMWARE_DIR") {
        candidate_roots.push(PathBuf::from(env_dir));
    }

    // Platform-specific search roots
    #[cfg(target_os = "windows")]
    {
        // Scan all Windows drive letters from A: to Z: (all partitions and mounted USB/external drives)
        for drive_letter in b'A'..=b'Z' {
            let drive_path = format!(r"{}:\", drive_letter as char);
            let path = PathBuf::from(&drive_path);
            if path.exists() && path.is_dir() {
                candidate_roots.push(path);
            }
        }
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            let user_path = PathBuf::from(&userprofile);
            candidate_roots.push(user_path.join("Downloads"));
            candidate_roots.push(user_path.join("Desktop"));
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Scan Ubuntu / Linux mounted media partitions (/run/media, /media, /mnt)
        let media_roots = ["/run/media", "/media", "/mnt"];
        for m in media_roots {
            let p = PathBuf::from(m);
            if p.exists() && p.is_dir() {
                candidate_roots.push(p);
            }
        }

        // Standard Linux firmware folders
        candidate_roots.push(PathBuf::from("/opt/flashkit/firmware"));
        candidate_roots.push(PathBuf::from("/opt/octopus/firmware"));
        candidate_roots.push(PathBuf::from("./firmware"));

        if let Ok(home) = std::env::var("HOME") {
            let home_path = PathBuf::from(&home);
            candidate_roots.push(home_path.join("Downloads"));
            candidate_roots.push(home_path.join("Desktop"));
        }
    }

    for root in candidate_roots {
        if root.exists() && root.is_dir() {
            scan_dir_recursive(&root, 0, 6, &mut results);
        }
    }

    // Sort and deduplicate by full path
    results.sort_by(|a, b| a.filename.cmp(&b.filename));
    results.dedup_by(|a, b| a.path == b.path);
    results
}

// ponytail: Scan ADB devices using standard native CLI (parallelized for instant response)
pub fn scan_adb_devices() -> Vec<DeviceInfo> {
    struct RawDev {
        serial: String,
        state: String,
        model: String,
        port: String,
    }

    let mut raw_list = Vec::new();

    if let Ok(output) = Command::new("adb").args(["devices", "-l"]).output() {
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines().skip(1) {
            let line = line.trim();
            if line.is_empty() || line.starts_with('*') {
                continue;
            }

            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                let serial = parts[0].to_string();
                let state = parts[1].to_string();

                // Parse model from line (e.g. model:SM_S908B)
                let model = parts
                    .iter()
                    .find(|p| p.starts_with("model:"))
                    .map(|p| p.replace("model:", "").replace('_', "-"))
                    .unwrap_or_else(|| "SAMSUNG_ANDROID".to_string());

                let port = parts
                    .iter()
                    .find(|p| p.starts_with("usb:"))
                    .map(|p| p.replace("usb:", ""))
                    .unwrap_or_else(|| "USB-PORT".to_string());

                // Lock USB topology port to serial and model history
                update_port_history(&port, &serial, &model);

                raw_list.push(RawDev {
                    serial,
                    state,
                    model,
                    port,
                });
            }
        }
    }

    if raw_list.is_empty() {
        return Vec::new();
    }

    // Query health in parallel threads
    let health_results: Vec<(Option<u32>, Option<f32>, Option<bool>, Option<String>, Option<String>)> = std::thread::scope(|s| {
        let handles: Vec<_> = raw_list
            .iter()
            .map(|dev| {
                s.spawn(move || {
                    if dev.state == "device" {
                        get_device_health(&dev.serial)
                    } else {
                        (None, None, None, None, None)
                    }
                })
            })
            .collect();

        handles.into_iter().map(|h| h.join().unwrap_or((None, None, None, None, None))).collect()
    });

    let mut devices = Vec::with_capacity(raw_list.len());
    for (dev, (bat_lvl, bat_temp, torch_on, b_type, pda_ver)) in raw_list.into_iter().zip(health_results.into_iter()) {
        devices.push(DeviceInfo {
            id: dev.serial.clone(),
            port: dev.port,
            serial: Some(dev.serial),
            model: dev.model,
            mode: if dev.state == "device" { "adb".to_string() } else { "recovery".to_string() },
            status: if dev.state == "device" { "Ready".to_string() } else { "Offline".to_string() },
            progress: None,
            current_task: Some("ADB Connected".to_string()),
            battery_level: bat_lvl,
            battery_temp: bat_temp,
            torch_on,
            build_type: b_type,
            pda_version: pda_ver,
        });
    }

    devices
}

fn get_device_health(serial: &str) -> (Option<u32>, Option<f32>, Option<bool>, Option<String>, Option<String>) {
    let out = Command::new("adb")
        .args([
            "-s",
            serial,
            "shell",
            "dumpsys battery | grep -m 1 level:; dumpsys battery | grep -m 1 temperature:; echo \"torch:$(settings get secure flashlight_enabled)\"; btype=$(getprop ro.system.build.type); [ -z \"$btype\" ] && btype=$(getprop ro.build.type); echo \"btype:$btype\"; pda=$(getprop ro.build.PDA); [ -z \"$pda\" ] && pda=$(getprop ro.boot.em.status); echo \"pda:$pda\"",
        ])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();

    let mut level: Option<u32> = None;
    let mut temp: Option<f32> = None;
    let mut torch: Option<bool> = None;
    let mut build_type: Option<String> = None;
    let mut pda_version: Option<String> = None;

    for line in out.lines() {
        let line = line.trim();
        if line.starts_with("level:") && level.is_none() {
            if let Ok(val) = line.replace("level:", "").trim().parse::<u32>() {
                level = Some(val);
            }
        } else if line.starts_with("temperature:") && temp.is_none() {
            if let Ok(raw_temp) = line.replace("temperature:", "").trim().parse::<f32>() {
                temp = Some(if raw_temp > 100.0 { raw_temp / 10.0 } else { raw_temp });
            }
        } else if line.starts_with("torch:") {
            let val = line.replace("torch:", "").trim().to_string();
            if val == "1" {
                torch = Some(true);
            } else if val == "0" {
                torch = Some(false);
            }
        } else if line.starts_with("btype:") {
            let val = line.replace("btype:", "").trim().to_string();
            if !val.is_empty() && val != "null" {
                build_type = Some(val);
            }
        } else if line.starts_with("pda:") {
            let val = line.replace("pda:", "").trim().to_string();
            if !val.is_empty() && val != "null" {
                pda_version = Some(val);
            }
        }
    }

    (
        level.or(Some(100)),
        temp.or(Some(31.5)),
        torch.or(Some(false)),
        build_type,
        pda_version,
    )
}

// ponytail: Scan real Samsung Odin / Download Mode devices via USB VID:PID (04e8:685d / 04e8:6601)
pub fn scan_odin_devices() -> Vec<DeviceInfo> {
    let mut devices = Vec::new();

    #[cfg(target_os = "linux")]
    {
        if let Ok(entries) = std::fs::read_dir("/sys/bus/usb/devices") {
            for entry in entries.flatten() {
                let path = entry.path();
                let vid_path = path.join("idVendor");
                let pid_path = path.join("idProduct");

                if vid_path.exists() && pid_path.exists() {
                    let vid = std::fs::read_to_string(&vid_path).unwrap_or_default().trim().to_lowercase();
                    let pid = std::fs::read_to_string(&pid_path).unwrap_or_default().trim().to_lowercase();

                    // Samsung VID: 04e8, Odin Download Mode PID: 685d or 6601
                    if vid == "04e8" && (pid == "685d" || pid == "6601") {
                        let port_id = entry.file_name().to_string_lossy().to_string();
                        if port_id.contains(':') {
                            continue; // Skip USB sub-interfaces
                        }

                        let serial_str = std::fs::read_to_string(path.join("serial"))
                            .map(|s| s.trim().to_string())
                            .ok()
                            .filter(|s| !s.is_empty());

                        let product_name = std::fs::read_to_string(path.join("product"))
                            .map(|s| s.trim().to_string())
                            .unwrap_or_else(|_| "SAMSUNG (Download Mode)".to_string());

                        // Recover serial and model from port history
                        let (hist_serial, hist_model) = get_port_history(&port_id).unwrap_or_default();
                        let final_serial = if !hist_serial.is_empty() {
                            Some(hist_serial)
                        } else {
                            serial_str
                        };
                        let dev_id = final_serial.clone().unwrap_or_else(|| format!("odin:{}", port_id));
                        let final_model = if !hist_model.is_empty() {
                            hist_model
                        } else if !product_name.is_empty() && product_name != "SAMSUNG (Download Mode)" && product_name != "SAMSUNG USB" {
                            product_name
                        } else {
                            "SAMSUNG ODIN".to_string()
                        };

                        devices.push(DeviceInfo {
                            id: dev_id,
                            port: port_id,
                            serial: final_serial,
                            model: final_model,
                            mode: "odin".to_string(),
                            status: "Ready".to_string(),
                            progress: None,
                            current_task: Some("Download Mode (Odin)".to_string()),
                            battery_level: None,
                            battery_temp: None,
                            torch_on: None,
                            build_type: None,
                            pda_version: None,
                        });
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows, query PNP entities matching Samsung Download Mode VID/PID (04E8&PID_685D)
        let ps_cmd = r#"Get-CimInstance Win32_PnPEntity | Where-Object { $_.DeviceID -like '*VID_04E8&PID_685D*' -or $_.DeviceID -like '*VID_04E8&PID_6601*' } | Select-Object -Property DeviceID, Name | ConvertTo-Json -Compress"#;
        if let Ok(output) = Command::new("powershell").args(["-NoProfile", "-Command", ps_cmd]).output() {
            let json_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !json_str.is_empty() {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&json_str) {
                    let items = if let Some(arr) = val.as_array() {
                        arr.clone()
                    } else {
                        vec![val]
                    };

                    for item in items {
                        let dev_id = item.get("DeviceID").and_then(|v| v.as_str()).unwrap_or("SAMSUNG_ODIN").to_string();
                        let name = item.get("Name").and_then(|v| v.as_str()).unwrap_or("SAMSUNG Mobile USB").to_string();

                        devices.push(DeviceInfo {
                            id: dev_id.clone(),
                            port: "USB".to_string(),
                            serial: Some(dev_id),
                            model: name,
                            mode: "odin".to_string(),
                            status: "Ready".to_string(),
                            progress: None,
                            current_task: Some("Download Mode (Odin)".to_string()),
                            battery_level: None,
                            battery_temp: None,
                            torch_on: None,
                            build_type: None,
                            pda_version: None,
                        });
                    }
                }
            }
        }
    }

    devices
}

pub fn scan_all_devices() -> Vec<DeviceInfo> {
    let mut all = scan_adb_devices();
    all.extend(scan_odin_devices());
    all
}
