//! AppKit bits rune doesn't expose: the trackpad's haptic tap and the left-only column-resize
//! cursor.

use std::sync::OnceLock;

use rune::{Cursor, CursorImage};

/// A tap on a Force Touch trackpad: `level` for a change of state (the sidebar collapsing), else
/// an alignment tick (the drag reaching the sidebar's minimum width).
#[cfg(target_os = "macos")]
pub(super) fn tap(level: bool) {
    use objc2_app_kit::{NSHapticFeedbackManager, NSHapticFeedbackPattern, NSHapticFeedbackPerformanceTime, NSHapticFeedbackPerformer};
    let pattern = if level { NSHapticFeedbackPattern::LevelChange } else { NSHapticFeedbackPattern::Alignment };
    eprintln!("cloudstash: haptic {}", if level { "level change" } else { "alignment" });
    NSHapticFeedbackManager::defaultPerformer().performFeedbackPattern_performanceTime(pattern, NSHapticFeedbackPerformanceTime::Now);
}

#[cfg(not(target_os = "macos"))]
pub(super) fn tap(_level: bool) {}

/// AppKit's column-resize cursor that points left only, for an edge that can't widen further;
/// the two-way one where it can't be had.
pub(super) fn resize_left_cursor() -> Cursor {
    static LEFT: OnceLock<Option<CursorImage>> = OnceLock::new();
    let image = || left_cursor().map(|(png, hot)| CursorImage::png(Box::leak(png.into_boxed_slice()), hot));
    LEFT.get_or_init(image).map_or(Cursor::ResizeColumn, Cursor::Image)
}

/// The system cursor's picture as a 2x PNG, as rune takes it, and its hot spot.
#[cfg(target_os = "macos")]
fn left_cursor() -> Option<(Vec<u8>, [f32; 2])> {
    use image::{ImageFormat, imageops::FilterType};
    use objc2_app_kit::{NSBitmapImageRep, NSCursor, NSHorizontalDirections};

    let cursor = NSCursor::columnResizeCursorInDirections(NSHorizontalDirections::Left);
    let picture = cursor.image();
    let points = picture.size().width;
    let tiff = picture.TIFFRepresentation()?;
    let reps = NSBitmapImageRep::imageRepsWithData(&tiff);
    let rep = reps.iter().max_by_key(|r| r.pixelsWide())?.downcast::<NSBitmapImageRep>().ok()?;
    let mut pixels = image::load_from_memory_with_format(&rep.TIFFRepresentation()?.to_vec(), ImageFormat::Tiff).ok()?;
    if f64::from(pixels.width()) < points * 1.5 {
        pixels = pixels.resize_exact(pixels.width() * 2, pixels.height() * 2, FilterType::Lanczos3);
    }
    let mut png = Vec::new();
    pixels.write_to(&mut std::io::Cursor::new(&mut png), ImageFormat::Png).ok()?;
    let hot = cursor.hotSpot();
    Some((png, [hot.x as f32, hot.y as f32]))
}

#[cfg(not(target_os = "macos"))]
fn left_cursor() -> Option<(Vec<u8>, [f32; 2])> {
    None
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    #[test]
    fn the_left_only_cursor_comes_from_appkit_at_2x() {
        let (png, hot) = super::left_cursor().expect("AppKit's left-only column-resize cursor");
        let picture = image::load_from_memory(&png).unwrap();
        image::save_buffer(std::env::temp_dir().join("left-cursor.png"), picture.as_bytes(), picture.width(), picture.height(), picture.color()).ok();
        assert!(picture.width() >= 32 && picture.height() >= 32, "{}x{} hot {hot:?}", picture.width(), picture.height());
    }
}
