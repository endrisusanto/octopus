use std::path::PathBuf;
use std::time::Duration;
use tokio::process::Command;
use tokio::time::sleep;

const PLAYSOUND_DEX: &[u8] = include_bytes!("../assets/playsound.dex");
const TWEET_OGG: &[u8] = include_bytes!("../assets/tweet.ogg");

fn silent_tokio_cmd<S: AsRef<std::ffi::OsStr>>(program: S) -> Command {
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut cmd = Command::new(program);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new(program)
    }
}

pub fn ensure_host_assets() -> Result<(PathBuf, PathBuf), String> {
    let tmp_dir = std::env::temp_dir();
    let dex_path = tmp_dir.join("octopus_playsound.dex");
    let ogg_path = tmp_dir.join("octopus_tweet.ogg");

    if !dex_path.exists() || std::fs::metadata(&dex_path).map(|m| m.len()).unwrap_or(0) == 0 {
        let _ = std::fs::write(&dex_path, PLAYSOUND_DEX);
    }
    if !ogg_path.exists() || std::fs::metadata(&ogg_path).map(|m| m.len()).unwrap_or(0) == 0 {
        let _ = std::fs::write(&ogg_path, TWEET_OGG);
    }

    Ok((dex_path, ogg_path))
}

pub async fn deploy_sound_to_device(serial: &str) -> Result<(), String> {
    let (dex_path, ogg_path) = ensure_host_assets()?;

    // Push dex
    let dex_res = silent_tokio_cmd("adb")
        .args(["-s", serial, "push", dex_path.to_str().unwrap(), "/data/local/tmp/playsound.dex"])
        .output()
        .await;

    // Push ogg
    let ogg_res = silent_tokio_cmd("adb")
        .args(["-s", serial, "push", ogg_path.to_str().unwrap(), "/data/local/tmp/tweet.ogg"])
        .output()
        .await;

    match (dex_res, ogg_res) {
        (Ok(_), Ok(_)) => Ok(()),
        _ => Err(format!("Failed to deploy sound assets to device {}", serial)),
    }
}

pub async fn play_sound_device(serial: &str) {
    let _ = deploy_sound_to_device(serial).await;
    let _ = silent_tokio_cmd("adb")
        .args([
            "-s",
            serial,
            "shell",
            "CLASSPATH=/data/local/tmp/playsound.dex app_process /data/local/tmp PlaySound /data/local/tmp/tweet.ogg",
        ])
        .output()
        .await;
}

pub async fn play_sound_pattern(pattern: &str, target_serials: &[String]) {
    if target_serials.is_empty() {
        return;
    }

    // Pre-deploy to all devices in parallel
    let mut deploy_futs = Vec::new();
    for s in target_serials {
        let s_clone = s.clone();
        deploy_futs.push(tokio::spawn(async move {
            let _ = deploy_sound_to_device(&s_clone).await;
        }));
    }
    for f in deploy_futs {
        let _ = f.await;
    }

    match pattern {
        "chorus" => {
            let mut play_futs = Vec::new();
            for s in target_serials {
                let s_clone = s.clone();
                play_futs.push(tokio::spawn(async move {
                    let _ = silent_tokio_cmd("adb")
                        .args([
                            "-s",
                            &s_clone,
                            "shell",
                            "CLASSPATH=/data/local/tmp/playsound.dex app_process /data/local/tmp PlaySound /data/local/tmp/tweet.ogg",
                        ])
                        .output()
                        .await;
                }));
            }
            for f in play_futs {
                let _ = f.await;
            }
        }
        "sequential" => {
            for s in target_serials {
                let _ = silent_tokio_cmd("adb")
                    .args([
                        "-s",
                        s,
                        "shell",
                        "CLASSPATH=/data/local/tmp/playsound.dex app_process /data/local/tmp PlaySound /data/local/tmp/tweet.ogg",
                    ])
                    .output()
                    .await;
                sleep(Duration::from_millis(220)).await;
            }
        }
        "random" => {
            let mut remaining = target_serials.to_vec();
            // Simple pseudo-random shuffle
            let mut rng_seed = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as usize;

            while !remaining.is_empty() {
                rng_seed = (rng_seed.wrapping_mul(1103515245).wrapping_add(12345)) & 0x7fffffff;
                let idx = rng_seed % remaining.len();
                let chosen = remaining.remove(idx);

                let _ = silent_tokio_cmd("adb")
                    .args([
                        "-s",
                        &chosen,
                        "shell",
                        "CLASSPATH=/data/local/tmp/playsound.dex app_process /data/local/tmp PlaySound /data/local/tmp/tweet.ogg",
                    ])
                    .output()
                    .await;

                let delay = 140 + (rng_seed % 180) as u64;
                sleep(Duration::from_millis(delay)).await;
            }
        }
        "chatter" | "bersautan" => {
            // Rapid staggered bursts across devices
            let mut play_futs = Vec::new();
            let mut seed = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as usize;

            for s in target_serials {
                seed = (seed.wrapping_mul(1103515245).wrapping_add(12345)) & 0x7fffffff;
                let offset_ms = (seed % 650) as u64;
                let s_clone = s.clone();

                play_futs.push(tokio::spawn(async move {
                    sleep(Duration::from_millis(offset_ms)).await;
                    let _ = silent_tokio_cmd("adb")
                        .args([
                            "-s",
                            &s_clone,
                            "shell",
                            "CLASSPATH=/data/local/tmp/playsound.dex app_process /data/local/tmp PlaySound /data/local/tmp/tweet.ogg",
                        ])
                        .output()
                        .await;
                }));
            }
            for f in play_futs {
                let _ = f.await;
            }
        }
        _ => {
            // Default: Single device or chorus
            if target_serials.len() == 1 {
                let _ = silent_tokio_cmd("adb")
                    .args([
                        "-s",
                        &target_serials[0],
                        "shell",
                        "CLASSPATH=/data/local/tmp/playsound.dex app_process /data/local/tmp PlaySound /data/local/tmp/tweet.ogg",
                    ])
                    .output()
                    .await;
            } else {
                // Fallback to chorus
                let mut play_futs = Vec::new();
                for s in target_serials {
                    let s_clone = s.clone();
                    play_futs.push(tokio::spawn(async move {
                        let _ = silent_tokio_cmd("adb")
                            .args([
                                "-s",
                                &s_clone,
                                "shell",
                                "CLASSPATH=/data/local/tmp/playsound.dex app_process /data/local/tmp PlaySound /data/local/tmp/tweet.ogg",
                            ])
                            .output()
                            .await;
                    }));
                }
                for f in play_futs {
                    let _ = f.await;
                }
            }
        }
    }
}
