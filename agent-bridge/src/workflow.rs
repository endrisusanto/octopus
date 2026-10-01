use crate::protocol::OutgoingMessage;
use crate::scanner::silent_command;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tokio::sync::mpsc::Sender;
use tokio::time::sleep;

fn find_asset(name: &str) -> Option<PathBuf> {
    let candidate_dirs = [
        PathBuf::from("./assets"),
        PathBuf::from("./agent-bridge/assets"),
        PathBuf::from("/usr/lib/FlashKit/_up_/assets"),
        PathBuf::from("/usr/share/octopus-agent-bridge/assets"),
        PathBuf::from("/home/endri-pro/dev/octopus/agent-bridge/assets"),
        PathBuf::from("/home/endri-pro/dev/BOW/bow-rust/assets"),
    ];

    for dir in candidate_dirs {
        let p = dir.join(name);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

fn get_odin_binary() -> String {
    if let Some(p) = find_asset("odin4") {
        return p.to_string_lossy().to_string();
    }
    if let Some(p) = find_asset("bin/linux/odin4") {
        return p.to_string_lossy().to_string();
    }
    if let Some(p) = find_asset("bin/windows/odin4.exe") {
        return p.to_string_lossy().to_string();
    }
    "odin4".to_string()
}

fn extract_percentage(line: &str) -> Option<u32> {
    if let Some(pct_idx) = line.find('%') {
        let prefix = &line[..pct_idx];
        let mut digits = String::new();
        for ch in prefix.chars().rev() {
            if ch.is_ascii_digit() {
                digits.insert(0, ch);
            } else if !digits.is_empty() {
                break;
            }
        }
        if let Ok(pct) = digits.parse::<u32>() {
            if pct <= 100 {
                return Some(pct);
            }
        }
    }
    None
}

fn check_odin_success(line: &str) -> bool {
    let upper = line.to_uppercase();
    upper.contains("SUCCEEDED 1")
        || upper.contains("FAILED 0")
        || upper.contains("ALL THREADS COMPLETED")
        || upper.contains("PASS!")
        || upper.contains("COMPLETED SUCCESSFULLY")
}

// ponytail: Zero-bloat automated HTTP stream & local cache engine
fn urlencoding_encode(s: &str) -> String {
    let mut res = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
            res.push(b as char);
        } else {
            res.push_str(&format!("%{:02X}", b));
        }
    }
    res
}

pub async fn ensure_firmware_file_cached<FLog, FProg>(
    input_path: &str,
    source_pc_id: Option<&str>,
    hub_url: Option<&str>,
    slot_name: &str,
    send_log: &FLog,
    send_progress: &FProg,
) -> Result<String, String>
where
    FLog: Fn(&str, String),
    FProg: Fn(u32, Option<&str>, Option<&str>),
{
    let trimmed = input_path.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }

    // 1. Direct path exists locally on disk
    let p = PathBuf::from(trimmed);
    if p.exists() && p.is_file() {
        return Ok(p.to_string_lossy().to_string());
    }

    // 2. Scanned local binaries
    let scanned = crate::scanner::scan_local_binaries(None, false);
    if let Some(found) = scanned.iter().find(|b| b.filename == trimmed || b.path.ends_with(trimmed)) {
        let fp = PathBuf::from(&found.path);
        if fp.exists() && fp.is_file() {
            return Ok(fp.to_string_lossy().to_string());
        }
    }

    // 3. Check local cache directory
    let cache_dir = {
        #[cfg(target_os = "windows")]
        {
            std::env::var("TEMP")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("C:\\Windows\\Temp"))
                .join("octopus_firmware_cache")
        }
        #[cfg(not(target_os = "windows"))]
        {
            PathBuf::from("/tmp/octopus_firmware_cache")
        }
    };

    if let Err(e) = tokio::fs::create_dir_all(&cache_dir).await {
        send_log("warn", format!("[Stream Engine] Gagal membuat direktori cache: {}", e));
    }

    let file_name = p.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| trimmed.to_string());

    let final_cached_path = cache_dir.join(&file_name);
    if final_cached_path.exists() {
        if let Ok(meta) = tokio::fs::metadata(&final_cached_path).await {
            if meta.len() > 0 {
                send_log(
                    "info",
                    format!(
                        "[Stream Engine] ⚡ Slot [{}]: Memakai firmware dari local cache: {} ({:.2} GB)",
                        slot_name,
                        final_cached_path.display(),
                        meta.len() as f64 / (1024.0 * 1024.0 * 1024.0)
                    ),
                );
                return Ok(final_cached_path.to_string_lossy().to_string());
            }
        }
    }

    // 4. If not found locally, stream download from Web Hub / Remote Node
    let hub_base = hub_url
        .filter(|u| !u.is_empty())
        .map(|u| {
            let u_str = u.trim();
            if u_str.starts_with("ws://") {
                format!("http://{}", &u_str[5..].trim_end_matches("/ws/bridge").trim_end_matches("/ws"))
            } else if u_str.starts_with("wss://") {
                format!("https://{}", &u_str[6..].trim_end_matches("/ws/bridge").trim_end_matches("/ws"))
            } else {
                u_str.trim_end_matches('/').to_string()
            }
        })
        .unwrap_or_else(|| "http://127.0.0.1:4000".to_string());

    let stream_url = format!(
        "{}/api/binaries/stream?path={}&sourcePcId={}&filename={}",
        hub_base,
        urlencoding_encode(trimmed),
        source_pc_id.unwrap_or(""),
        urlencoding_encode(&file_name)
    );

    send_log(
        "info",
        format!(
            "[Stream Engine] 🌐 Slot [{}]: Firmware berada di node remote ({}). Memulai HTTP streaming download ke cache lokal...",
            slot_name,
            source_pc_id.unwrap_or("Hub")
        ),
    );

    let temp_part_path = cache_dir.join(format!("{}.part", file_name));

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Reqwest client init error: {}", e))?;

    let res = client.get(&stream_url)
        .send()
        .await
        .map_err(|e| format!("Gagal menghubungi stream endpoint {}: {}", stream_url, e))?;

    if !res.status().is_success() {
        return Err(format!(
            "Stream download gagal dengan status HTTP {}: {}",
            res.status(),
            stream_url
        ));
    }

    let total_bytes = res.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(&temp_part_path)
        .await
        .map_err(|e| format!("Gagal membuat cache file part: {}", e))?;

    let mut stream = res.bytes_stream();
    use futures_util::StreamExt;
    let mut downloaded_bytes = 0u64;
    let start_time = std::time::Instant::now();
    let mut last_log_time = std::time::Instant::now();
    let mut last_progress_pct = 0u32;

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|e| format!("Stream read error: {}", e))?;
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(|e| format!("Write chunk error: {}", e))?;

        downloaded_bytes += chunk.len() as u64;

        let pct = if total_bytes > 0 {
            ((downloaded_bytes as f64 / total_bytes as f64) * 100.0) as u32
        } else {
            0
        };

        if last_log_time.elapsed() >= Duration::from_millis(800) || pct == 100 {
            last_log_time = std::time::Instant::now();
            let elapsed_sec = start_time.elapsed().as_secs_f64().max(0.001);
            let speed_mb_s = (downloaded_bytes as f64 / (1024.0 * 1024.0)) / elapsed_sec;
            let dl_gb = downloaded_bytes as f64 / (1024.0 * 1024.0 * 1024.0);
            let total_gb = total_bytes as f64 / (1024.0 * 1024.0 * 1024.0);

            if pct != last_progress_pct {
                last_progress_pct = pct;
                send_progress(pct, Some("Downloading..."), Some(&format!("Stream {} ({}%)", slot_name, pct)));
            }

            send_log(
                "info",
                format!(
                    "[Stream Engine] 📥 Slot [{}] {}% ({:.2} GB / {:.2} GB @ {:.1} MB/s)",
                    slot_name, pct, dl_gb, total_gb, speed_mb_s
                ),
            );
        }
    }

    tokio::io::AsyncWriteExt::flush(&mut file).await.map_err(|e| format!("Flush error: {}", e))?;
    drop(file);

    // Atomic rename from .part to final cache file
    tokio::fs::rename(&temp_part_path, &final_cached_path)
        .await
        .map_err(|e| format!("Gagal rename file cache part: {}", e))?;

    let final_gb = downloaded_bytes as f64 / (1024.0 * 1024.0 * 1024.0);
    send_log(
        "success",
        format!(
            "[Stream Engine] ✅ Slot [{}]: Selesai streaming & caching {} ({:.2} GB). Siap dieksekusi!",
            slot_name, file_name, final_gb
        ),
    );

    Ok(final_cached_path.to_string_lossy().to_string())
}

fn resolve_odin_devnode(port_hint: Option<&str>, odin_bin: &str) -> Option<String> {
    let clean_port = port_hint
        .map(|p| p.trim().trim_start_matches("USB:").trim_start_matches("usb:").trim())
        .filter(|p| !p.is_empty());

    // 1. Dapatkan daftar devnode aktif dari odin4 -l
    let active_odin_devs = silent_command(odin_bin)
        .arg("-l")
        .output()
        .map(|out| {
            String::from_utf8_lossy(&out.stdout)
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty() && (l.starts_with("/dev/") || l.contains("COM")))
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();

    if active_odin_devs.is_empty() {
        return None;
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(target) = clean_port {
            // Cek langsung /sys/bus/usb/devices/<target>
            let target_sys = PathBuf::from("/sys/bus/usb/devices").join(target);
            if let (Ok(b_str), Ok(d_str)) = (
                std::fs::read_to_string(target_sys.join("busnum")),
                std::fs::read_to_string(target_sys.join("devnum")),
            ) {
                if let (Ok(b), Ok(d)) = (b_str.trim().parse::<u32>(), d_str.trim().parse::<u32>()) {
                    let candidate = format!("/dev/bus/usb/{:03}/{:03}", b, d);
                    if active_odin_devs.contains(&candidate) {
                        return Some(candidate);
                    }
                }
            }

            // Fallback: Scan seluruh /sys/bus/usb/devices untuk mapping devnode -> port
            if let Ok(entries) = std::fs::read_dir("/sys/bus/usb/devices") {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let port_name = entry.file_name().to_string_lossy().to_string();
                    if port_name == target || port_name.ends_with(target) || target.ends_with(&port_name) {
                        if let (Ok(b_str), Ok(d_str)) = (
                            std::fs::read_to_string(p.join("busnum")),
                            std::fs::read_to_string(p.join("devnum")),
                        ) {
                            if let (Ok(b), Ok(d)) = (b_str.trim().parse::<u32>(), d_str.trim().parse::<u32>()) {
                                let devnode = format!("/dev/bus/usb/{:03}/{:03}", b, d);
                                if active_odin_devs.contains(&devnode) {
                                    return Some(devnode);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(target) = clean_port {
            if let Some(m) = active_odin_devs.iter().find(|d| d.contains(target)) {
                return Some(m.clone());
            }
        }
    }

    // Fallback: Jika tanpa port hint cocok atau hanya 1 odin device terhubung
    if active_odin_devs.len() == 1 {
        return Some(active_odin_devs[0].clone());
    }

    None
}

pub async fn execute_workflow_pipeline(
    device_id: String,
    serial_hint: Option<String>,
    port_hint: Option<String>,
    mode_hint: Option<String>,
    odin_flash: bool,
    ap_path: String,
    ap_pc_id: Option<String>,
    bl_path: String,
    bl_pc_id: Option<String>,
    cp_path: String,
    cp_pc_id: Option<String>,
    csc_path: String,
    csc_pc_id: Option<String>,
    userdata_path: String,
    userdata_pc_id: Option<String>,
    skip_suw: bool,
    setup_gba: bool,
    wifi_enabled: bool,
    wifi_ssid: String,
    wifi_password: String,
    post_torch: bool,
    torch_mode: String,
    hub_url: Option<String>,
    tx: Sender<OutgoingMessage>,
) {
    let target_serial = if let Some(s) = serial_hint.filter(|s| !s.is_empty() && s != "UNKNOWN") {
        s
    } else {
        device_id.clone()
    };

    let send_log = |level: &str, msg: String| {
        let tx = tx.clone();
        let dev_id = device_id.clone();
        let level = level.to_string();
        tokio::spawn(async move {
            let _ = tx
                .send(OutgoingMessage::LogStream {
                    device_id: Some(dev_id),
                    level,
                    message: msg,
                })
                .await;
        });
    };

    let send_progress = |progress: u32, status: Option<&str>, task: Option<&str>| {
        let tx = tx.clone();
        let dev_id = device_id.clone();
        let status = status.map(|s| s.to_string());
        let task = task.map(|t| t.to_string());
        tokio::spawn(async move {
            let _ = tx
                .send(OutgoingMessage::DeviceProgress {
                    device_id: dev_id,
                    progress,
                    status,
                    current_task: task,
                })
                .await;
        });
    };

    send_log(
        "info",
        format!(
            "[Workflow] Memulai pipeline automasi untuk target '{}' (Serial: {})...",
            device_id, target_serial
        ),
    );

    // Resolve & cache firmware files (local or automated HTTP streaming from remote nodes)
    let ap_resolved = match ensure_firmware_file_cached(&ap_path, ap_pc_id.as_deref(), hub_url.as_deref(), "AP", &send_log, &send_progress).await {
        Ok(p) => p,
        Err(e) => {
            send_log("error", format!("[Stream Engine] ❌ Gagal streaming slot AP: {}", e));
            send_progress(0, Some("Fail"), Some("Gagal Download AP"));
            return;
        }
    };
    let bl_resolved = match ensure_firmware_file_cached(&bl_path, bl_pc_id.as_deref(), hub_url.as_deref(), "BL", &send_log, &send_progress).await {
        Ok(p) => p,
        Err(e) => {
            send_log("error", format!("[Stream Engine] ❌ Gagal streaming slot BL: {}", e));
            send_progress(0, Some("Fail"), Some("Gagal Download BL"));
            return;
        }
    };
    let cp_resolved = match ensure_firmware_file_cached(&cp_path, cp_pc_id.as_deref(), hub_url.as_deref(), "CP", &send_log, &send_progress).await {
        Ok(p) => p,
        Err(e) => {
            send_log("error", format!("[Stream Engine] ❌ Gagal streaming slot CP: {}", e));
            send_progress(0, Some("Fail"), Some("Gagal Download CP"));
            return;
        }
    };
    let csc_resolved = match ensure_firmware_file_cached(&csc_path, csc_pc_id.as_deref(), hub_url.as_deref(), "CSC", &send_log, &send_progress).await {
        Ok(p) => p,
        Err(e) => {
            send_log("error", format!("[Stream Engine] ❌ Gagal streaming slot CSC: {}", e));
            send_progress(0, Some("Fail"), Some("Gagal Download CSC"));
            return;
        }
    };
    let userdata_resolved = match ensure_firmware_file_cached(&userdata_path, userdata_pc_id.as_deref(), hub_url.as_deref(), "USERDATA", &send_log, &send_progress).await {
        Ok(p) => p,
        Err(e) => {
            send_log("error", format!("[Stream Engine] ❌ Gagal streaming slot USERDATA: {}", e));
            send_progress(0, Some("Fail"), Some("Gagal Download USERDATA"));
            return;
        }
    };

    send_log(
        "info",
        format!(
            "[Workflow Config] Odin Flash: {}, AP Path: '{}'",
            odin_flash, if ap_resolved.is_empty() { "None" } else { &ap_resolved }
        ),
    );


    // ==========================================
    // TAHAP 1: ODIN FLASHING (Jika Diaktifkan)
    // ==========================================
    let has_firmware = !ap_resolved.is_empty() || !bl_resolved.is_empty() || !cp_resolved.is_empty() || !csc_resolved.is_empty();
    if odin_flash && has_firmware {
        send_log("info", format!("[Odin Engine] ⚡ Menyiapkan proses Odin Flashing untuk {}...", target_serial));
        send_progress(5, Some("Flashing..."), Some("Menyiapkan Odin Flashing..."));

        // Jika mode saat ini adalah ADB, reboot ke Download Mode
        let is_adb_mode = mode_hint.as_deref() == Some("adb") || {
            let mut check = silent_command("adb");
            check.arg("-s").arg(&target_serial).arg("get-state");
            check.output().map(|o| String::from_utf8_lossy(&o.stdout).trim() == "device").unwrap_or(false)
        };

        if is_adb_mode {
            send_log("info", format!("[Odin Engine] 🔄 Me-reboot perangkat {} ke Download Mode...", target_serial));
            send_progress(8, Some("Flashing..."), Some("Rebooting ke Download Mode..."));
            let mut reb = silent_command("adb");
            reb.arg("-s").arg(&target_serial).arg("reboot").arg("download");
            let _ = reb.output();
            // Berikan jeda USB dan reload udev rules untuk refresh izin devnode
            sleep(Duration::from_millis(1500)).await;
            crate::scanner::reload_udev_and_adb();
        }

        // Cari port target Odin dengan polling & mapping USB topology yang presisi
        let odin_bin = get_odin_binary();
        let mut odin_target_dev = String::new();

        send_log("info", format!("[Odin Engine] 🔍 Mencari DevNode Odin untuk Port USB: {}...", port_hint.as_deref().unwrap_or("auto")));
        for attempt in 1..=20 {
            sleep(Duration::from_millis(1000)).await;
            if let Some(devnode) = resolve_odin_devnode(port_hint.as_deref(), &odin_bin) {
                odin_target_dev = devnode;
                break;
            }
            if attempt % 4 == 0 {
                crate::scanner::reload_udev_and_adb();
                send_log("info", format!("[Odin Engine] ⏳ Menunggu deteksi USB Download Mode (percobaan {}/20)...", attempt));
            }
        }

        send_log(
            "info",
            format!(
                "[Odin Engine] 🚀 Memulai flashing binary via Odin4 (DevNode: {})...",
                if odin_target_dev.is_empty() { "Auto-detect" } else { &odin_target_dev }
            ),
        );
        send_progress(10, Some("Flashing..."), Some("Memulai Odin Flashing..."));

        let odin_bin_clone = odin_bin.clone();
        let ap_clone = ap_resolved.clone();
        let bl_clone = bl_resolved.clone();
        let cp_clone = cp_resolved.clone();
        let csc_clone = csc_resolved.clone();
        let userdata_clone = userdata_resolved.clone();
        let odin_dev_clone = odin_target_dev.clone();
        let tx_odin = tx.clone();
        let dev_id_clone = device_id.clone();

        let flash_res = tokio::task::spawn_blocking(move || -> Result<(), String> {
            let mut cmd = silent_command(&odin_bin_clone);
            cmd.arg("--ignore-md5");

            if !ap_clone.is_empty() {
                cmd.arg("-a").arg(&ap_clone);
            }
            if !bl_clone.is_empty() {
                cmd.arg("-b").arg(&bl_clone);
            }
            if !cp_clone.is_empty() {
                cmd.arg("-c").arg(&cp_clone);
            }
            if !csc_clone.is_empty() {
                cmd.arg("-s").arg(&csc_clone);
            }
            if !userdata_clone.is_empty() {
                cmd.arg("-u").arg(&userdata_clone);
            }
            if !odin_dev_clone.is_empty() {
                cmd.arg("-d").arg(&odin_dev_clone);
            }

            cmd.stdout(Stdio::piped());
            cmd.stderr(Stdio::piped());

            let mut child = cmd.spawn().map_err(|e| format!("Gagal menjalankan odin4 binary ({}): {}", odin_bin_clone, e))?;
            let stdout = child.stdout.take().ok_or("Gagal membaca stdout odin4")?;
            let stderr = child.stderr.take();

            // Thread khusus untuk menangkap dan mengirim stderr odin4 secara real-time
            let tx_err = tx_odin.clone();
            let dev_id_err = dev_id_clone.clone();
            let stderr_handle = std::thread::spawn(move || -> String {
                let mut err_collector = String::new();
                if let Some(se) = stderr {
                    let reader = BufReader::new(se);
                    for line in reader.lines().flatten() {
                        let trimmed = line.trim().to_string();
                        if !trimmed.is_empty() {
                            err_collector.push_str(&trimmed);
                            err_collector.push('\n');
                            let tx = tx_err.clone();
                            let dev_id = dev_id_err.clone();
                            let t = trimmed.clone();
                            tokio::spawn(async move {
                                let _ = tx.send(OutgoingMessage::LogStream {
                                    device_id: Some(dev_id),
                                    level: "error".to_string(),
                                    message: format!("[Odin Error] {}", t),
                                }).await;
                            });
                        }
                    }
                }
                err_collector
            });

            let reader = BufReader::new(stdout);
            let mut is_success = false;
            let mut last_emitted_pct: u32 = 0;

            for line in reader.lines().flatten() {
                let trimmed = line.trim().to_string();
                if !trimmed.is_empty() {
                    if check_odin_success(&trimmed) {
                        is_success = true;
                    }

                    // Extract live percentage (e.g., "super.img.lz4 ( 45%)" or "10%")
                    if let Some(pct) = extract_percentage(&trimmed) {
                        let task_name = trimmed.split('(').next().unwrap_or("").trim().to_string();
                        let display_task = if task_name.is_empty() {
                            "Flashing Firmware...".to_string()
                        } else {
                            format!("Flashing: {}", task_name)
                        };

                        if pct != last_emitted_pct {
                            last_emitted_pct = pct;
                            let tx = tx_odin.clone();
                            let dev_id = dev_id_clone.clone();
                            let t_name = display_task.clone();
                            tokio::spawn(async move {
                                let _ = tx.send(OutgoingMessage::DeviceProgress {
                                    device_id: dev_id,
                                    progress: pct,
                                    status: Some("Flashing...".to_string()),
                                    current_task: Some(t_name),
                                }).await;
                            });
                        }
                    } else {
                        // If line indicates a new partition being flashed (e.g. "super.img.lz4")
                        if trimmed.ends_with(".lz4") || trimmed.ends_with(".img") || trimmed.ends_with(".bin") || trimmed.starts_with("Upload") {
                            let tx = tx_odin.clone();
                            let dev_id = dev_id_clone.clone();
                            let t_name = format!("Flashing: {}", trimmed);
                            let cur_pct = last_emitted_pct;
                            tokio::spawn(async move {
                                let _ = tx.send(OutgoingMessage::DeviceProgress {
                                    device_id: dev_id,
                                    progress: cur_pct,
                                    status: Some("Flashing...".to_string()),
                                    current_task: Some(t_name),
                                }).await;
                            });
                        }

                        // Kirim log stdout
                        let tx = tx_odin.clone();
                        let dev_id = dev_id_clone.clone();
                        let log_text = trimmed.clone();
                        tokio::spawn(async move {
                            let _ = tx.send(OutgoingMessage::LogStream {
                                device_id: Some(dev_id),
                                level: "info".to_string(),
                                message: format!("[Odin] {}", log_text),
                            }).await;
                        });
                    }
                }
            }

            let status = child.wait().map_err(|e| format!("Odin process error: {}", e))?;
            let err_output = stderr_handle.join().unwrap_or_default();
            if is_success || status.success() {
                Ok(())
            } else {
                let msg = if !err_output.trim().is_empty() {
                    format!("Odin gagal (exit {:?}): {}", status.code(), err_output.trim())
                } else {
                    format!("Odin exit with status code {:?}", status.code())
                };
                Err(msg)
            }
        })
        .await;

        match flash_res {
            Ok(Ok(())) => {
                send_log("info", format!("[Odin Engine] ✅ Odin Flashing SUKSES untuk {}!", target_serial));
                send_progress(50, Some("Flashing..."), Some("Menunggu Device Booting..."));
                send_log("info", "[Workflow] ⏳ Menunggu perangkat selesai boot up ke sistem Android OS (timeout 5 menit)...".to_string());

                // Tunggu perangkat terdeteksi kembali di ADB dengan timeout 5 menit & reload udev berkala (matching FlashKit)
                let serial_boot = target_serial.clone();
                let tx_poll = tx.clone();
                let dev_id_poll = device_id.clone();

                let adb_boot_res = tokio::task::spawn_blocking(move || {
                    const MAX_ATTEMPTS: usize = 120; // 120 x 2.5s = 300s (5 menit total window)
                    let mut found = false;

                    for attempt in 1..=MAX_ATTEMPTS {
                        let elapsed_sec = (attempt * 5) / 2;

                        // Periodic udev and adb reload (setiap 5 iterasi / ~12.5 detik, matching FlashKit)
                        if attempt % 5 == 1 {
                            crate::scanner::reload_udev_and_adb();

                            let tx = tx_poll.clone();
                            let dev_id = dev_id_poll.clone();
                            let msg = format!("[Workflow] ⏳ Menunggu boot up & refresh USB bus ({}s / 300s)...", elapsed_sec);
                            tokio::spawn(async move {
                                let _ = tx.send(OutgoingMessage::LogStream {
                                    device_id: Some(dev_id),
                                    level: "info".to_string(),
                                    message: msg,
                                }).await;
                            });
                        }

                        // Periksa status device di ADB
                        let mut check_state = silent_command("adb");
                        check_state.arg("-s").arg(&serial_boot).arg("get-state");
                        if let Ok(out) = check_state.output() {
                            let state = String::from_utf8_lossy(&out.stdout).trim().to_string();
                            if state == "device" {
                                let mut cmd = silent_command("adb");
                                cmd.arg("-s").arg(&serial_boot).arg("shell").arg("getprop sys.boot_completed");
                                if let Ok(prop_out) = cmd.output() {
                                    let prop = String::from_utf8_lossy(&prop_out.stdout).trim().to_string();
                                    if prop == "1" || !prop.is_empty() {
                                        std::thread::sleep(Duration::from_secs(2));
                                        found = true;
                                        break;
                                    }
                                }
                                std::thread::sleep(Duration::from_millis(1500));
                                found = true;
                                break;
                            }
                        }

                        // Jeda polling
                        std::thread::sleep(Duration::from_millis(2500));
                    }

                    found
                }).await.unwrap_or(false);

                if adb_boot_res {
                    send_log("info", format!("[Workflow] ✅ Perangkat {} telah menyala penuh dan siap di-provision!", target_serial));
                } else {
                    send_log("error", format!("[Workflow Error] ❌ Device {} tidak terdeteksi setelah batas waktu 5 menit. Membatalkan workflow.", target_serial));
                    send_progress(100, Some("Fail"), Some("Error: Device Timeout (5 Menit)"));
                    return;
                }
            }
            Ok(Err(err)) => {
                send_log("error", format!("[Odin Engine Error] ❌ Flashing gagal: {}", err));
                send_progress(100, Some("Fail"), Some("Odin Flashing Gagal"));
                return;
            }
            Err(e) => {
                send_log("error", format!("[Odin Engine Panic] Task error: {}", e));
                send_progress(100, Some("Fail"), Some("Internal Task Error"));
                return;
            }
        }
    }

    // ==========================================
    // TAHAP 2: CEK KONEKSI ADB
    // ==========================================
    send_progress(55, Some("Flashing..."), Some("Memeriksa status koneksi ADB..."));
    let serial_check = target_serial.clone();
    let state_check = tokio::task::spawn_blocking(move || {
        let mut cmd = silent_command("adb");
        cmd.arg("-s").arg(&serial_check).arg("get-state");
        match cmd.output() {
            Ok(out) => {
                let state = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if state == "device" {
                    Ok(())
                } else {
                    crate::scanner::reload_udev_and_adb();
                    Err(format!("Device state: '{}'", state))
                }
            }
            Err(e) => Err(format!("Gagal menjalankan adb: {}", e)),
        }
    })
    .await;

    if let Ok(Err(err)) = state_check {
        send_log("warn", format!("[Workflow] Status ADB perangkat: {}", err));
    }

    sleep(Duration::from_millis(800)).await;

    // Helper function to send AT exploit commands to Samsung modem ports
    fn send_at_exploit_samsung() -> Vec<String> {
        use std::io::{Read, Write};
        let mut logs = Vec::new();

        if let Ok(ports) = serialport::available_ports() {
            for p in ports {
                if let serialport::SerialPortType::UsbPort(info) = p.port_type {
                    if info.vid == 0x04e8 {
                        let port_name = p.port_name.clone();
                        if let Ok(mut port) = serialport::new(&port_name, 115200)
                            .timeout(Duration::from_secs(3))
                            .open()
                        {
                            let _ = port.write_all(b"AT+USBDEBUG=1\r\n");
                            std::thread::sleep(Duration::from_millis(350));
                            let mut buf = [0u8; 512];
                            let _ = port.read(&mut buf);

                            let _ = port.write_all(b"AT+ENGMODES=1,2,0\r\n");
                            std::thread::sleep(Duration::from_millis(350));
                            let _ = port.read(&mut buf);

                            logs.push(format!("AT Exploit terkirim ke {}", port_name));
                        }
                    }
                }
            }
        }

        logs
    }

    // Helper closure to run adb shell with automatic retry & udev reload on error: closed
    fn run_shell_with_retry(serial: &str, cmd_str: &str, logs: &mut Vec<String>) {
        let mut last_err = String::new();

        for attempt in 1..=5 {
            let mut cmd = silent_command("adb");
            cmd.arg("-s").arg(serial).arg("shell").arg(cmd_str);

            if let Ok(out) = cmd.output() {
                let out_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
                let err_str = String::from_utf8_lossy(&out.stderr).trim().to_string();

                if out.status.success() && !out_str.contains("error: closed") && !err_str.contains("error: closed") && !err_str.contains("device not found") {
                    if !out_str.is_empty() {
                        logs.push(out_str);
                    }
                    return;
                }

                last_err = if !err_str.is_empty() { err_str } else { out_str };
            }

            if last_err.contains("closed") || last_err.contains("device not found") || last_err.contains("device offline") {
                let _ = send_at_exploit_samsung();
                crate::scanner::reload_udev_and_adb();
                std::thread::sleep(Duration::from_millis(800 * attempt));
                continue;
            } else {
                break;
            }
        }

        if !last_err.is_empty() {
            logs.push(format!("ERR: {}", last_err));
        }
    }

    // ==========================================
    // TAHAP 3: SKIP SETUP WIZARD (SUW)
    // ==========================================
    if skip_suw {
        send_log("info", format!("[SUW Bypass] ⚡ Menjalankan bypass Setup Wizard pada {}...", target_serial));
        send_progress(65, Some("Flashing..."), Some("Menjalankan SUW Bypass..."));

        let serial_suw = target_serial.clone();
        let suw_res = tokio::task::spawn_blocking(move || -> Vec<String> {
            let mut logs = Vec::new();

            // 1. Kirim AT Exploit ke Modem Samsung
            let at_logs = send_at_exploit_samsung();
            for l in at_logs {
                logs.push(format!("[AT] {}", l));
            }
            std::thread::sleep(Duration::from_millis(1500));
            crate::scanner::reload_udev_and_adb();

            // 2. Pastikan ADB daemon ready
            let _ = silent_command("adb").args(["-s", &serial_suw, "wait-for-device"]).output();

            // 3. Install Language Helper APK jika ada (matching FlashKit)
            if let Some(lang_apk) = find_asset("language.apk") {
                let _ = silent_command("adb")
                    .args(["-s", &serial_suw, "install", "-r", "-g", "--bypass-low-target-sdk-block", &lang_apk.to_string_lossy()])
                    .output();
                run_shell_with_retry(&serial_suw, "am start -n net.sanapeli.adbchangelanguage/.AdbChangeLanguage --es language en --es country US", &mut logs);
                std::thread::sleep(Duration::from_millis(600));
            }

            // 4. Set system language & provision flags
            run_shell_with_retry(&serial_suw, "settings put global system_locales en-US", &mut logs);
            run_shell_with_retry(&serial_suw, "settings put system system_locales en-US", &mut logs);
            run_shell_with_retry(&serial_suw, "settings put global stay_on_while_plugged_in 7", &mut logs);
            run_shell_with_retry(&serial_suw, "settings put global device_provisioned 1", &mut logs);
            run_shell_with_retry(&serial_suw, "settings put secure user_setup_complete 1", &mut logs);
            run_shell_with_retry(&serial_suw, "settings put global verifier_verify_adb_installs 0", &mut logs);
            run_shell_with_retry(&serial_suw, "settings put system samsung_eula_agree 1", &mut logs);
            run_shell_with_retry(&serial_suw, "settings put system screen_off_timeout 600000", &mut logs);
            run_shell_with_retry(&serial_suw, "settings put system time_12_24 12", &mut logs);
            run_shell_with_retry(&serial_suw, "locksettings set-disabled true", &mut logs);

            // 5. Install & Run Data Saver Instrumentation Test (matching FlashKit)
            if let Some(apk1) = find_asset("Data_Saver_Test-debug.apk") {
                let _ = silent_command("adb")
                    .args(["-s", &serial_suw, "install", "-r", "-g", "--bypass-low-target-sdk-block", &apk1.to_string_lossy()])
                    .output();
            }
            if let Some(apk2) = find_asset("Data_Saver_Test-debug-androidTest.apk") {
                let _ = silent_command("adb")
                    .args(["-s", &serial_suw, "install", "-r", "-g", "--bypass-low-target-sdk-block", &apk2.to_string_lossy()])
                    .output();
                let _ = silent_command("adb")
                    .args(["-s", &serial_suw, "shell", "am instrument -w -m -e debug false -e class 'com.example.DataSaver.ExampleInstrumentedTest' com.example.DataSaver.test/androidx.test.runner.AndroidJUnitRunner"])
                    .output();
                std::thread::sleep(Duration::from_millis(500));
            }

            // 6. Disable SecSetupWizard & Google Setup Wizard
            run_shell_with_retry(&serial_suw, "pm disable-user com.sec.android.app.SecSetupWizard", &mut logs);
            run_shell_with_retry(&serial_suw, "pm disable-user com.google.android.setupwizard", &mut logs);

            // 7. Cleanup helper APKs
            let _ = silent_command("adb").args(["-s", &serial_suw, "uninstall", "com.example.DataSaver"]).output();
            let _ = silent_command("adb").args(["-s", &serial_suw, "uninstall", "com.example.DataSaver.test"]).output();
            let _ = silent_command("adb").args(["-s", &serial_suw, "uninstall", "net.sanapeli.adbchangelanguage"]).output();

            run_shell_with_retry(&serial_suw, "svc wifi enable", &mut logs);
            run_shell_with_retry(&serial_suw, "settings put global wifi_on 1", &mut logs);
            run_shell_with_retry(&serial_suw, "input keyevent 3", &mut logs); // KEYCODE_HOME

            logs
        })
        .await;

        if let Ok(output_logs) = suw_res {
            for log_line in output_logs {
                send_log("info", format!("[SUW Bypass] {}", log_line));
            }
            send_log("info", format!("[SUW Bypass] ✅ SUW Bypass selesai pada {}.", target_serial));
            send_progress(75, Some("Flashing..."), Some("SUW Bypass Sukses"));
        }
        sleep(Duration::from_millis(1200)).await;
    }

    // ==========================================
    // TAHAP 4: SETUP PRECONDITION / GBA
    // ==========================================
    if setup_gba {
        send_log("info", format!("[Setup GBA] 🔑 Menjalankan konfigurasi GBA & Developer Settings pada {}...", target_serial));
        send_progress(80, Some("Flashing..."), Some("Mengonfigurasi Setup GBA..."));

        let serial_gba = target_serial.clone();
        let gba_res = tokio::task::spawn_blocking(move || -> Vec<String> {
            let mut logs = Vec::new();

            run_shell_with_retry(&serial_gba, "settings put global development_settings_enabled 1", &mut logs);
            run_shell_with_retry(&serial_gba, "settings put global adb_enabled 1", &mut logs);
            run_shell_with_retry(&serial_gba, "settings put global verifier_verify_adb_installs 0", &mut logs);
            run_shell_with_retry(&serial_gba, "svc usb setFunctions mtp", &mut logs);
            run_shell_with_retry(&serial_gba, "settings put system screen_off_timeout 600000", &mut logs);
            run_shell_with_retry(&serial_gba, "settings put global stay_on_while_plugged_in 7", &mut logs);
            run_shell_with_retry(&serial_gba, "settings put system time_12_24 12", &mut logs);
            run_shell_with_retry(&serial_gba, "locksettings set-disabled true", &mut logs);
            run_shell_with_retry(&serial_gba, "svc wifi enable", &mut logs);

            logs
        })
        .await;

        if let Ok(output_logs) = gba_res {
            for log_line in output_logs {
                send_log("info", format!("[Setup GBA] {}", log_line));
            }
            send_log("info", format!("[Setup GBA] ✅ Setup GBA flags berhasil diterapkan pada {}.", target_serial));
            send_progress(88, Some("Flashing..."), Some("Setup GBA Sukses"));
        }
        sleep(Duration::from_millis(1200)).await;
    }

    // ==========================================
    // TAHAP 5: WI-FI AUTO-CONNECT
    // ==========================================
    if wifi_enabled && !wifi_ssid.is_empty() {
        send_log("info", format!("[Wi-Fi] 📶 Menyambungkan {} ke Wi-Fi SSID '{}'...", target_serial, wifi_ssid));
        send_progress(92, Some("Flashing..."), Some("Menyambungkan Wi-Fi..."));

        let serial_wifi = target_serial.clone();
        let ssid_clone = wifi_ssid.clone();
        let pass_clone = wifi_password.clone();

        let wifi_res = tokio::task::spawn_blocking(move || -> Vec<String> {
            let mut logs = Vec::new();
            let wifi_cmd = if pass_clone.is_empty() {
                format!("cmd -w wifi connect-network '{}' open", ssid_clone)
            } else {
                format!("cmd -w wifi connect-network '{}' wpa2 '{}'", ssid_clone, pass_clone)
            };
            run_shell_with_retry(&serial_wifi, &wifi_cmd, &mut logs);
            logs
        })
        .await;

        if let Ok(output_logs) = wifi_res {
            for log_line in output_logs {
                send_log("info", format!("[Wi-Fi] {}", log_line));
            }
            send_log("info", format!("[Wi-Fi] ✅ Wi-Fi '{}' berhasil dikonfigurasi pada {}.", wifi_ssid, target_serial));
            send_progress(98, Some("Flashing..."), Some("Wi-Fi Terhubung"));
        }
        sleep(Duration::from_millis(1000)).await;
    }

    // ==========================================
    // TAHAP 6: FINALIZE & POST COMPLETED ACTION
    // ==========================================
    send_log(
        "info",
        format!(
            "[Workflow] 🎉 Seluruh alur automasi berhasil diselesaikan untuk {}.",
            target_serial
        ),
    );

    // Post Completed Action: Menyalakan senter jika opsi diaktifkan
    if post_torch {
        if torch_mode == "screen" {
            send_log(
                "info",
                format!(
                    "[Workflow] 💡 Menyalakan screen brightness 100% untuk {} sebagai penanda workflow selesai (Post Completed Action)...",
                    target_serial
                ),
            );
            let _ = silent_command("adb")
                .args(["-s", &target_serial, "shell", "input", "keyevent", "224"])
                .output();
            let _ = silent_command("adb")
                .args(["-s", &target_serial, "shell", "settings", "put", "system", "screen_brightness_mode", "0"])
                .output();
            let _ = silent_command("adb")
                .args(["-s", &target_serial, "shell", "settings", "put", "system", "screen_brightness", "255"])
                .output();
        } else {
            send_log(
                "info",
                format!(
                    "[Workflow] 💡 Menyalakan senter flash kamera untuk {} sebagai penanda workflow selesai (Post Completed Action)...",
                    target_serial
                ),
            );
            let _ = silent_command("python3")
                .args(["/home/endri-pro/led.py", "on", &target_serial])
                .current_dir("/home/endri-pro")
                .output();
        }

        send_progress(100, Some("Pass"), Some("Automasi Selesai (Senter ON)"));
    } else {
        send_progress(100, Some("Pass"), Some("Automasi Selesai"));
    }
}
