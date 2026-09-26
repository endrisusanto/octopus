use crate::protocol::{BinaryFileInfo, DeviceInfo};
use std::path::PathBuf;
use std::process::Command;

// ponytail: Scan local binary / firmware directory on Bridge PC
pub fn scan_local_binaries(custom_dir: Option<&str>) -> Vec<BinaryFileInfo> {
    let mut results = Vec::new();
    let mut candidate_dirs: Vec<PathBuf> = Vec::new();

    if let Some(dir) = custom_dir {
        candidate_dirs.push(PathBuf::from(dir));
    }

    if let Ok(env_dir) = std::env::var("OCTOPUS_FIRMWARE_DIR") {
        candidate_dirs.push(PathBuf::from(env_dir));
    }

    // Default system search paths
    #[cfg(target_os = "windows")]
    {
        candidate_dirs.push(PathBuf::from(r"C:\FlashKit\Firmware"));
        candidate_dirs.push(PathBuf::from(r"C:\Octopus\Firmware"));
        candidate_dirs.push(PathBuf::from(r"D:\Firmware"));
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            candidate_dirs.push(PathBuf::from(userprofile).join("Downloads"));
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        candidate_dirs.push(PathBuf::from("/opt/flashkit/firmware"));
        candidate_dirs.push(PathBuf::from("/opt/octopus/firmware"));
        candidate_dirs.push(PathBuf::from("./firmware"));
        if let Ok(home) = std::env::var("HOME") {
            candidate_dirs.push(PathBuf::from(home).join("Downloads"));
        }
    }

    let valid_extensions = ["tar", "md5", "bin", "img", "lz4", "zip"];

    for dir in candidate_dirs {
        if dir.exists() && dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                        let ext = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
                        
                        let is_ap_or_fw = filename.starts_with("AP_") 
                            || filename.starts_with("BL_")
                            || filename.starts_with("CP_")
                            || filename.starts_with("CSC_")
                            || valid_extensions.contains(&ext.as_str())
                            || filename.ends_with(".tar.md5");

                        if is_ap_or_fw {
                            let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
                            results.push(BinaryFileInfo {
                                filename,
                                path: path.to_string_lossy().to_string(),
                                size_bytes,
                            });
                        }
                    }
                }
            }
        }
    }

    // Deduplicate by path
    results.sort_by(|a, b| a.filename.cmp(&b.filename));
    results.dedup_by(|a, b| a.path == b.path);
    results
}

// ponytail: Scan ADB devices using standard native CLI
pub fn scan_adb_devices() -> Vec<DeviceInfo> {
    let mut devices = Vec::new();

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
                let state = parts[1];

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

                devices.push(DeviceInfo {
                    id: serial.clone(),
                    port,
                    serial: Some(serial),
                    model,
                    mode: if state == "device" { "adb".to_string() } else { "recovery".to_string() },
                    status: if state == "device" { "Ready".to_string() } else { "Offline".to_string() },
                    progress: None,
                    current_task: Some("ADB Connected".to_string()),
                    battery_level: Some(85),
                });
            }
        }
    }

    devices
}

// ponytail: Scan Odin download mode devices (Linux devnodes or Windows COM ports)
pub fn scan_odin_devices() -> Vec<DeviceInfo> {
    let mut devices = Vec::new();

    #[cfg(target_os = "linux")]
    {
        // Check for Samsung modem ACM ports or Odin nodes
        if let Ok(entries) = std::fs::read_dir("/dev") {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("ttyACM") {
                    devices.push(DeviceInfo {
                        id: format!("/dev/{}", name),
                        port: format!("/dev/{}", name),
                        serial: None,
                        model: "SAMSUNG ODIN".to_string(),
                        mode: "odin".to_string(),
                        status: "Ready".to_string(),
                        progress: None,
                        current_task: Some("Download Mode".to_string()),
                        battery_level: None,
                    });
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
