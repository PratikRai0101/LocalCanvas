use std::{ffi::CString, os::raw::c_char, path::Path};

use crate::fs::library::CommandResult;

const TRANSCRIPT_CAPACITY: usize = 64 * 1024;

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn localcanvas_transcribe_audio(
        path: *const c_char,
        output: *mut c_char,
        output_capacity: usize,
    ) -> i32;
}

pub fn transcribe_audio(path: &Path) -> CommandResult<String> {
    #[cfg(target_os = "macos")]
    {
        let path = CString::new(path.to_string_lossy().as_bytes())
            .map_err(|_| "Voice note path isn't valid.".to_owned())?;
        let mut output = vec![0_u8; TRANSCRIPT_CAPACITY];
        // The Objective-C bridge performs the asynchronous Speech request and
        // writes either its final transcript or a human-readable error here.
        let status = unsafe {
            localcanvas_transcribe_audio(
                path.as_ptr(),
                output.as_mut_ptr().cast::<c_char>(),
                output.len(),
            )
        };
        let length = output.iter().position(|byte| *byte == 0).unwrap_or(output.len());
        let message = String::from_utf8_lossy(&output[..length]).trim().to_owned();
        if status == 0 && !message.is_empty() {
            return Ok(message);
        }
        return Err(if message.is_empty() {
            "On-device transcription couldn't complete.".to_owned()
        } else {
            message
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("On-device transcription is available on macOS only.".to_owned())
    }
}
