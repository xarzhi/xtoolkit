use rodio::{Decoder, MixerDeviceSink, Player};
use std::fs::File;
use std::io::BufReader;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread;
use tauri::Emitter;
use tauri::Window;
use tokio::time::Duration;

pub struct AudioPlayer {
    pub _handle: MixerDeviceSink,
    pub player: Arc<Mutex<Player>>,
    pub progress_running: Arc<AtomicBool>,
}

impl AudioPlayer {
    pub fn new() -> Self {
        let handle =
            rodio::DeviceSinkBuilder::open_default_sink().expect("open default audio stream");
        let player = rodio::Player::connect_new(&handle.mixer());
        println!("cpal host: {:?}", cpal::default_host().id());

        Self {
            _handle: handle,
            player: Arc::new(Mutex::new(player)),
            progress_running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn play(&self, window: Window, path: String) -> Result<(), String> {
        self.progress_running.store(false, Ordering::SeqCst);

        window
            .emit("progress_start", {})
            .expect("progress_start error");
        println!("{}", path);

        let file = BufReader::new(File::open(&path).map_err(|e| e.to_string())?);

        let source = Decoder::try_from(file).map_err(|e| e.to_string())?;

        let player = self.player.lock().map_err(|e| e.to_string())?;

        player.stop(); // 停止当前
        player.append(source); // 添加音源
        let player = Arc::clone(&self.player);
        let running = Arc::clone(&self.progress_running);
        running.store(true, Ordering::SeqCst);
        thread::spawn(move || {
            while running.load(Ordering::SeqCst) {
                let is_paused = player.lock().unwrap().is_paused();
                if is_paused {
                    thread::sleep(Duration::from_millis(200));
                    continue;
                }

                let pos = player.lock().unwrap().get_pos().as_millis();
                window.emit("progress_update", pos).ok();

                thread::sleep(Duration::from_millis(500));
            }
            println!("progress thread exit");
        });
        Ok(())
    }

    pub fn try_seek(&self, window: Window, path: String, aim_pos: Duration) -> Result<(), String> {
        if let Ok(player) = self.player.lock() {
            let cur_pos = player.get_pos();
            if aim_pos > cur_pos {
                player.try_seek(aim_pos).map_err(|e| e.to_string())?; // 停止当前
            } else {
                let file = BufReader::new(File::open(&path).map_err(|e| e.to_string())?);
                let source = Decoder::try_from(file).map_err(|e| e.to_string())?;

                player.stop(); // 停止当前
                player.append(source); // 添加新的音源

                player.try_seek(aim_pos).unwrap_or_default();
            }
            window.emit("try_seek", aim_pos).expect("try_seek error");
        }
        Ok(())
    }
    pub fn start(&self, window: Window) {
        if let Ok(player) = self.player.lock() {
            window.emit("start", {}).expect("start error");
            player.play();
        }
    }

    pub fn pause(&self, window: Window) {
        if let Ok(player) = self.player.lock() {
            window.emit("pause", {}).expect("pause error");
            player.pause();
        }
    }
    pub fn is_paused(&self) -> bool {
        if let Ok(player) = self.player.lock() {
            player.is_paused()
        } else {
            false
        }
    }
    pub fn get_pos(&self) -> u128 {
        if let Ok(player) = self.player.lock() {
            player.get_pos().as_millis()
        } else {
            0
        }
    }

    pub fn is_empty(&self) -> bool {
        if let Ok(player) = self.player.lock() {
            player.empty()
        } else {
            false
        }
    }
    pub fn set_volume(&self, value: f32) {
        if let Ok(player) = self.player.lock() {
            player.set_volume(value);
        }
    }

    pub fn stop(&self) {
        self.progress_running.store(false, Ordering::SeqCst);
        if let Ok(player) = self.player.lock() {
            player.stop();
        }
    }
}
