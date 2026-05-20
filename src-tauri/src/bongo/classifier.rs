use rdev::Key;

/// Left or right hand zone based on QWERTY touch-typing finger assignment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum BongoSide {
    Left,
    Right,
}

/// Classify an rdev Key as left-hand or right-hand zone.
/// Unrecognised keys default to Left.
pub fn classify_key(key: &Key) -> Option<BongoSide> {
    Some(match key {
        // Left hand zone
        Key::KeyQ
        | Key::KeyW
        | Key::KeyE
        | Key::KeyR
        | Key::KeyT
        | Key::KeyA
        | Key::KeyS
        | Key::KeyD
        | Key::KeyF
        | Key::KeyG
        | Key::KeyZ
        | Key::KeyX
        | Key::KeyC
        | Key::KeyV
        | Key::KeyB
        | Key::ShiftLeft
        | Key::ControlLeft
        | Key::Alt
        | Key::MetaLeft => BongoSide::Left,

        // Right hand zone
        Key::KeyY
        | Key::KeyH
        | Key::KeyU
        | Key::KeyI
        | Key::KeyO
        | Key::KeyP
        | Key::KeyJ
        | Key::KeyK
        | Key::KeyL
        | Key::KeyN
        | Key::KeyM
        | Key::ShiftRight
        | Key::ControlRight
        | Key::MetaRight => BongoSide::Right,

        // Numbers, symbols, space, function keys — default to Left
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn left_keys() {
        assert_eq!(classify_key(&Key::KeyA), Some(BongoSide::Left));
        assert_eq!(classify_key(&Key::KeyQ), Some(BongoSide::Left));
        assert_eq!(classify_key(&Key::KeyB), Some(BongoSide::Left));
    }

    #[test]
    fn right_keys() {
        assert_eq!(classify_key(&Key::KeyJ), Some(BongoSide::Right));
        assert_eq!(classify_key(&Key::KeyY), Some(BongoSide::Right));
        assert_eq!(classify_key(&Key::KeyM), Some(BongoSide::Right));
    }

    #[test]
    fn left_modifiers() {
        assert_eq!(classify_key(&Key::ShiftLeft), Some(BongoSide::Left));
        assert_eq!(classify_key(&Key::MetaLeft), Some(BongoSide::Left));
        assert_eq!(classify_key(&Key::Alt), Some(BongoSide::Left));
    }

    #[test]
    fn right_modifiers() {
        assert_eq!(classify_key(&Key::ShiftRight), Some(BongoSide::Right));
        assert_eq!(classify_key(&Key::MetaRight), Some(BongoSide::Right));
    }

    #[test]
    fn unclassified_returns_none() {
        assert_eq!(classify_key(&Key::Space), None);
        assert_eq!(classify_key(&Key::Escape), None);
        assert_eq!(classify_key(&Key::Num0), None);
    }
}
