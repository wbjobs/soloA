use std::io::Cursor;
use rodio::{Decoder, OutputStream, Sink, Source};

pub fn play_notification_sound() {
    if let Ok((_stream, stream_handle)) = OutputStream::try_default() {
        if let Ok(sink) = Sink::try_new(&stream_handle) {
            let sine_wave = rodio::source::SineWave::new(880)
                .take_duration(std::time::Duration::from_millis(200))
                .amplify(0.5);
            
            let beep1 = sine_wave.clone();
            let silence = rodio::source::Zero::new(44100, 2).take_duration(std::time::Duration::from_millis(100));
            let beep2 = sine_wave;
            
            let source = beep1.chain(silence).chain(beep2);
            sink.append(source);
            sink.sleep_until_end();
        }
    }
}

pub fn play_sound_bytes(data: &[u8]) {
    if let Ok((_stream, stream_handle)) = OutputStream::try_default() {
        let cursor = Cursor::new(data);
        if let Ok(source) = Decoder::new(cursor) {
            if let Ok(sink) = Sink::try_new(&stream_handle) {
                sink.append(source);
                sink.sleep_until_end();
            }
        }
    }
}
