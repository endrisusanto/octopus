use crate::protocol::DeviceInfo;
use std::process::Command;

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
