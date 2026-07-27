use std::ffi::{CStr, c_char};

use crate::fs::library::CommandResult;

const MAX_IMAGE_BYTES: usize = 25 * 1024 * 1024;

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn localcanvas_recognize_text(
        bytes: *const u8,
        length: usize,
        error_message: *mut *mut c_char,
    ) -> *mut c_char;
    fn localcanvas_ocr_free(value: *mut c_char);
}

pub fn recognize_image_text(bytes: &[u8]) -> CommandResult<String> {
    if bytes.is_empty() {
        return Err("The image is empty.".to_owned());
    }
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("Images larger than 25 MB can't be analyzed for text.".to_owned());
    }

    #[cfg(target_os = "macos")]
    unsafe {
        let mut error_message = std::ptr::null_mut();
        let result = localcanvas_recognize_text(bytes.as_ptr(), bytes.len(), &mut error_message);
        if result.is_null() {
            let message = c_string(error_message).unwrap_or_else(|| "Vision could not recognize text.".to_owned());
            return Err(message);
        }
        Ok(c_string(result).unwrap_or_default())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = bytes;
        Err("OCR is currently available on macOS only.".to_owned())
    }
}

#[cfg(target_os = "macos")]
unsafe fn c_string(value: *mut c_char) -> Option<String> {
    if value.is_null() {
        return None;
    }
    let string = CStr::from_ptr(value).to_string_lossy().into_owned();
    localcanvas_ocr_free(value);
    Some(string)
}
