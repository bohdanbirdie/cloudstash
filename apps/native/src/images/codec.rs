//! Shrinking a downloaded picture to the size it's drawn and saving it small: JPEG for an opaque
//! picture, PNG for one with see-through parts, which JPEG can't keep.

use std::path::Path;

use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{ExtendedColorType, ImageEncoder};

const QUALITY: u8 = 82;

pub struct Made {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    pub file: Vec<u8>,
    pub ext: &'static str,
    pub file_len: u64,
}

impl Made {
    /// Writes the file beside `base` with its extension; false if it couldn't.
    pub fn save(&self, base: &Path) -> bool {
        std::fs::write(base.with_extension(self.ext), &self.file).is_ok()
    }
}

/// Cropped to fill `size` (or, `whole`, shrunk to fit inside it), never enlarged, and encoded.
pub fn make(bytes: &[u8], (width, height): (u32, u32), whole: bool) -> Option<Made> {
    let picture = image::load_from_memory(bytes).ok()?;
    let fitted = match (picture.width() > width || picture.height() > height, whole) {
        (false, _) => picture,
        (true, false) => picture.resize_to_fill(width, height, FilterType::Triangle),
        (true, true) => picture.resize(width, height, FilterType::Triangle),
    };
    let rgba = fitted.to_rgba8();
    let (w, h) = rgba.dimensions();
    let mut file = Vec::new();
    let ext = if rgba.pixels().all(|p| p.0[3] == 255) {
        JpegEncoder::new_with_quality(&mut file, QUALITY).write_image(fitted.to_rgb8().as_raw(), w, h, ExtendedColorType::Rgb8).ok()?;
        "jpg"
    } else {
        image::codecs::png::PngEncoder::new(&mut file).write_image(rgba.as_raw(), w, h, ExtendedColorType::Rgba8).ok()?;
        "png"
    };
    let file_len = file.len() as u64;
    Some(Made { width: w, height: h, rgba: rgba.into_raw(), file, ext, file_len })
}

/// A saved copy, decoded.
pub fn load(bytes: &[u8]) -> Option<(u32, u32, Vec<u8>)> {
    let rgba = image::load_from_memory(bytes).ok()?.to_rgba8();
    Some((rgba.width(), rgba.height(), rgba.into_raw()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    fn png(img: &RgbaImage) -> Vec<u8> {
        let mut out = Vec::new();
        image::codecs::png::PngEncoder::new(&mut out).write_image(img.as_raw(), img.width(), img.height(), ExtendedColorType::Rgba8).unwrap();
        out
    }

    #[test]
    fn an_opaque_picture_is_cropped_to_fill_and_saved_as_jpeg() {
        let made = make(&png(&RgbaImage::from_pixel(400, 100, Rgba([200, 10, 10, 255]))), (80, 55), false).unwrap();
        assert_eq!((made.width, made.height, made.ext), (80, 55, "jpg"));
        assert_eq!(load(&made.file).map(|(w, h, _)| (w, h)), Some((80, 55)));
    }

    #[test]
    fn a_see_through_picture_stays_png_and_a_small_one_is_not_enlarged() {
        let made = make(&png(&RgbaImage::from_pixel(20, 20, Rgba([0, 0, 0, 0]))), (80, 55), false).unwrap();
        assert_eq!((made.width, made.height, made.ext), (20, 20, "png"));
    }

    #[test]
    fn a_whole_picture_keeps_its_shape_inside_the_size() {
        let made = make(&png(&RgbaImage::from_pixel(400, 100, Rgba([200, 10, 10, 255]))), (80, 80), true).unwrap();
        assert_eq!((made.width, made.height), (80, 20));
    }
}
