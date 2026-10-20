"""
Computer Vision and OCR Pipeline for Pokémon Red Game Screen.
Analyzes 160x144 Game Boy frames using OpenCV, Pillow, and optional PyTesseract.
"""
from typing import Dict, Any, Tuple, Optional
import numpy as np
import cv2
from PIL import Image

try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except (ImportError, ModuleNotFoundError):
    TESSERACT_AVAILABLE = False
    pytesseract = None

class ScreenVision:
    def __init__(self, use_ocr: bool = False):
        self.use_ocr = use_ocr and TESSERACT_AVAILABLE

    def analyze_frame(self, frame_rgb: np.ndarray) -> Dict[str, Any]:
        """
        Comprehensive CV inspection of a (144, 160, 3) Game Boy frame.
        Returns visual indicators: textbox open, battle scene, fading, menu active.
        """
        h, w, c = frame_rgb.shape
        gray = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2GRAY)

        # 1. Screen fade detection (all dark or all light)
        mean_val = np.mean(gray)
        is_faded_out = (mean_val < 5.0) or (mean_val > 250.0)

        # 2. Text Box Detection (bottom third: rows 100 to 143)
        bottom_region = gray[100:144, :]
        textbox_detected = self._detect_textbox(bottom_region)

        # 3. Battle Screen Detection
        # In battles: HP bars exist in top-left (enemy) and bottom-right (player),
        # plus the typical battle battlebox borders.
        is_battle = self._detect_battle_screen(gray)

        # 4. Start / Select Menu Detection (right-side white menu overlay)
        # In overworld start menu: rectangle from x=100 to 159, y=0 to 120 with white bg and black borders
        menu_detected = self._detect_menu(gray)

        return {
            "is_fading": bool(is_faded_out),
            "has_textbox": textbox_detected,
            "dialogue_box": textbox_detected,
            "has_menu": menu_detected,
            "menu": menu_detected,
            "has_battle_hud": is_battle,
            "battle_screen": is_battle,
            "mean_luminance": float(mean_val)
        }

    def _detect_textbox(self, bottom_gray: np.ndarray) -> bool:
        """Checks for the characteristic Pokemon Red dialogue box borders."""
        # Top border at row index ~3-6 in bottom region (y=103-106)
        # Look for horizontal dark line across columns 8 to 150
        if bottom_gray.shape[0] < 10:
            return False

        top_line = bottom_gray[3:6, 12:148]
        is_dark_border = np.mean(top_line < 50) > 0.65
        inner_box = bottom_gray[10:35, 16:144]
        is_white_bg = np.mean(inner_box > 200) > 0.60

        return bool(is_dark_border and is_white_bg)

    def _detect_battle_screen(self, gray: np.ndarray) -> bool:
        """Detects HP bar boxes and battle stage graphics."""
        # Player HP bar area: rows 70 to 100, cols 80 to 155
        player_hud_region = gray[70:105, 80:155]
        # Look for HP bar template: horizontal line of 48 pixels
        edges = cv2.Canny(player_hud_region, 50, 150)
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=20, minLineLength=25, maxLineGap=3)
        has_hp_line = lines is not None and len(lines) >= 1

        # Check for battle menu area: bottom right options FIGHT, PKMN, ITEM, RUN
        battle_options_area = gray[104:144, 75:155]
        has_battle_box = np.mean(battle_options_area > 200) > 0.45

        return bool(has_hp_line and has_battle_box)

    def _detect_menu(self, gray: np.ndarray) -> bool:
        """Detects Start menu or selection popup on right side."""
        # Start menu in Gen 1 covers x: 96 to 159, y: 0 to 110
        menu_region = gray[0:110, 96:160]
        # Has white background with black border
        border_col = menu_region[:, 0]
        has_left_border = np.mean(border_col < 50) > 0.50
        has_menu_white = np.mean(menu_region[:, 2:] > 200) > 0.50
        return bool(has_left_border and has_menu_white)

    def read_text(self, frame_rgb: np.ndarray, bbox: Optional[Tuple[int, int, int, int]] = None) -> str:
        """Perform OCR on specified bounding box or bottom text area."""
        if not self.use_ocr or pytesseract is None:
            return ""

        if bbox:
            x1, y1, x2, y2 = bbox
            crop = frame_rgb[y1:y2, x1:x2]
        else:
            # Default to dialogue box
            crop = frame_rgb[100:144, 8:152]

        try:
            pil_img = Image.fromarray(crop).convert("L")
            # Upscale 3x for OCR clarity
            pil_img = pil_img.resize((pil_img.width * 3, pil_img.height * 3), Image.Resampling.NEAREST)
            text = pytesseract.image_to_string(pil_img, config="--psm 6")
            return text.strip()
        except Exception:
            return ""

# Export alias
ScreenVisionAnalyzer = ScreenVision
