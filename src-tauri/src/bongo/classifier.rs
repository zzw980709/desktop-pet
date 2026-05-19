/// Classify a macOS CGKeyCode as left-hand or right-hand zone based on
/// standard QWERTY touch-typing finger assignment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum BongoSide {
    Left,
    Right,
}

/// Maps macOS keycodes to BongoSide. Keycodes not in either list default to Left.
/// Source: <https://web.archive.org/web/20100501161453/http://www.classicteck.com/rbarticles/mackeyboard.php>
pub fn classify_keycode(keycode: u16) -> BongoSide {
    // Left hand zone
    if matches!(
        keycode,
        0   // A
        | 1  // S
        | 2  // D
        | 3  // F
        | 5  // G
        | 6  // Z
        | 7  // X
        | 8  // C
        | 9  // V
        | 11 // B
        | 12 // Q
        | 13 // W
        | 14 // E
        | 15 // R
        | 17 // T
        | 55 // LeftCommand
        | 56 // LeftShift
        | 58 // LeftOption
        | 59 // LeftControl
    ) {
        return BongoSide::Left;
    }

    // Right hand zone
    if matches!(
        keycode,
        4   // H
        | 16 // Y
        | 31 // O
        | 32 // U
        | 34 // I
        | 35 // P
        | 37 // L
        | 38 // J
        | 40 // K
        | 45 // N
        | 46 // M
        | 54 // RightCommand
        | 60 // RightShift
        | 61 // RightOption
        | 62 // RightControl
    ) {
        return BongoSide::Right;
    }

    // Numbers, symbols, space, function keys, etc. default to Left
    BongoSide::Left
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn left_keys() {
        assert_eq!(classify_keycode(0), BongoSide::Left);  // A
        assert_eq!(classify_keycode(12), BongoSide::Left); // Q
        assert_eq!(classify_keycode(11), BongoSide::Left); // B
    }

    #[test]
    fn right_keys() {
        assert_eq!(classify_keycode(38), BongoSide::Right); // J
        assert_eq!(classify_keycode(16), BongoSide::Right); // Y
        assert_eq!(classify_keycode(46), BongoSide::Right); // M
    }

    #[test]
    fn left_modifiers() {
        assert_eq!(classify_keycode(56), BongoSide::Left); // LeftShift
        assert_eq!(classify_keycode(55), BongoSide::Left); // LeftCommand
    }

    #[test]
    fn right_modifiers() {
        assert_eq!(classify_keycode(60), BongoSide::Right); // RightShift
        assert_eq!(classify_keycode(54), BongoSide::Right); // RightCommand
    }

    #[test]
    fn unclassified_defaults_left() {
        assert_eq!(classify_keycode(49), BongoSide::Left); // Space
        assert_eq!(classify_keycode(53), BongoSide::Left); // Escape
        assert_eq!(classify_keycode(29), BongoSide::Left); // Num0
    }
}
