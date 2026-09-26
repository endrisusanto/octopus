mod protocol;
mod scanner;
mod updater;

use futures_util::{SinkExt, StreamExt};
use protocol::{IncomingMessage, OutgoingMessage};
use std::env;
use std::thread;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};
use tokio::time::sleep;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

fn get_pc_id() -> String {
    if let Ok(val) = env::var("PC_ID") {
        return val;
    }
    let os_name = if cfg!(target_os = "windows") { "WIN" } else { "UBUNTU" };
    let host = match hostname::get() {
        Ok(h) => h.to_string_lossy().to_string().to_uppercase(),
        Err(_) => "NODE-01".to_string(),
    };
    format!("{}-{}", os_name, host)
}

fn get_os_type() -> String {
    if cfg!(target_os = "windows") {
        "windows".to_string()
    } else {
        "ubuntu".to_string()
    }
}

// Background WebSocket Worker Thread
async fn run_bridge_worker(hub_url: String, pc_id: String, os_type: String) {
    loop {
        println!("[Bridge] Connecting to Hub Server: {} ...", hub_url);

        match connect_async(&hub_url).await {
            Ok((ws_stream, _)) => {
                println!("[Bridge] Connected successfully! Registering PC ID: {}", pc_id);
                let (mut write, mut read) = ws_stream.split();

                // 1. Send Register Message
                let reg_msg = OutgoingMessage::Register {
                    pc_id: pc_id.clone(),
                    os: os_type.clone(),
                };
                if let Ok(json) = serde_json::to_string(&reg_msg) {
                    let _ = write.send(Message::Text(json.into())).await;
                }

                // 2. Spawn device & local binary scanner loop
                let (tx, mut rx) = tokio::sync::mpsc::channel::<OutgoingMessage>(32);

                let scanner_handle = tokio::spawn(async move {
                    let mut tick_count: u32 = 0;
                    loop {
                        let devices = scanner::scan_all_devices();
                        let update = OutgoingMessage::DeviceList { devices };
                        if tx.send(update).await.is_err() {
                            break;
                        }

                        // Scan local binaries every 10 seconds (5 ticks)
                        if tick_count % 5 == 0 {
                            let binaries = scanner::scan_local_binaries(None);
                            let bin_update = OutgoingMessage::BinaryList { binaries };
                            let _ = tx.send(bin_update).await;
                        }
                        tick_count = tick_count.wrapping_add(1);

                        sleep(Duration::from_secs(2)).await;
                    }
                });

                // 3. Main message forwarding & handling loop
                loop {
                    tokio::select! {
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
                                                println!("[Bridge Command] Target Device: {}, Action: {}", exec.device_id, exec.action);
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
                                                }
                                            }
                                        }
                                    }
                                }
                                Ok(Message::Close(_)) | Err(_) => {
                                    println!("[Bridge] Connection closed by Hub Server");
                                    break;
                                }
                                _ => {}
                            }
                        }
                    }
                }

                scanner_handle.abort();
            }
            Err(err) => {
                eprintln!("[Bridge] Connection failed: {}. Retrying in 3 seconds...", err);
            }
        }

        sleep(Duration::from_secs(3)).await;
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let is_headless = args.iter().any(|a| a == "--headless" || a == "-d");

    let hub_url = env::var("HUB_URL")
        .unwrap_or_else(|_| "wss://octopus.endrisusanto.my.id/ws/bridge".to_string());
    let pc_id = get_pc_id();
    let os_type = get_os_type();

    println!("==================================================");
    println!(" Octopus Lightweight Agent Bridge");
    println!(" PC ID:   {}", pc_id);
    println!(" OS:      {}", os_type);
    println!(" Hub URL: {}", hub_url);
    println!(" Mode:    {}", if is_headless { "Headless Daemon" } else { "Tauri Desktop with AppTray" });
    println!("==================================================");

    if is_headless {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(run_bridge_worker(hub_url, pc_id, os_type));
        return;
    }

    // Spawn async background worker thread for Tauri app
    let worker_hub_url = hub_url.clone();
    let worker_pc_id = pc_id.clone();
    let worker_os = os_type.clone();
    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(run_bridge_worker(worker_hub_url, worker_pc_id, worker_os));
    });

    // Start Tauri Desktop App with System Tray & Close-to-Tray Prevention
    tauri::Builder::default()
        .setup(|app| {
            let status_item = MenuItem::with_id(app, "status", "Status: Connected", false, None::<&str>)?;
            let show_item = MenuItem::with_id(app, "show", "Show Bridge Window", true, None::<&str>)?;
            let web_item = MenuItem::with_id(app, "web", "Open Web Hub (octopus.endrisusanto.my.id)", true, None::<&str>)?;
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
