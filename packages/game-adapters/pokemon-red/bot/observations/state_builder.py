"""
State Builder: Merges Screen Vision and RAM Telemetry into a Unified GameObservation.
"""
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional
import numpy as np


@dataclass
class GameObservation:
    mode: str = "OVERWORLD"         # INTRO, FADING, BATTLE, DIALOGUE, MENU, OVERWORLD
    map_id: int = 0
    map_name: str = "Pallet Town"
    player_x: int = 0
    player_y: int = 0
    facing: str = "down"
    in_battle: bool = False
    party_count: int = 0
    party: List[Dict[str, Any]] = field(default_factory=list)
    lead_hp_ratio: float = 1.0
    total_party_hp_ratio: float = 1.0
    badges_count: int = 0
    money: int = 0
    has_dialogue: bool = False
    has_menu: bool = False
    is_fading: bool = False
    confidence: float = 1.0          # 0.0 - 1.0 confidence score
    raw_frame: Optional[np.ndarray] = None
    step_count: int = 0
    player_name: str = "RED"
    rival_name: str = "BLUE"

    # Support constructor kwargs aliases
    def __init__(self, **kwargs):
        self.mode = kwargs.get("mode", "OVERWORLD")
        self.map_id = kwargs.get("map_id", 0)
        self.map_name = kwargs.get("map_name", "Pallet Town")
        self.player_x = kwargs.get("player_x", kwargs.get("x", 0))
        self.player_y = kwargs.get("player_y", kwargs.get("y", 0))
        self.facing = kwargs.get("facing", "down")
        self.in_battle = bool(kwargs.get("in_battle", kwargs.get("battle_status", 0) != 0))
        self.party_count = kwargs.get("party_count", 0)
        self.party = kwargs.get("party", [])
        self.lead_hp_ratio = float(kwargs.get("lead_hp_ratio", kwargs.get("party_hp_ratio", 1.0)))
        self.total_party_hp_ratio = float(kwargs.get("total_party_hp_ratio", kwargs.get("party_hp_ratio", 1.0)))
        self.badges_count = int(kwargs.get("badges_count", kwargs.get("badges", 0)))
        self.money = int(kwargs.get("money", 0))
        self.has_dialogue = bool(kwargs.get("has_dialogue", kwargs.get("dialogue_open", False)))
        self.has_menu = bool(kwargs.get("has_menu", False))
        self.is_fading = bool(kwargs.get("is_fading", False))
        self.confidence = float(kwargs.get("confidence", 1.0))
        self.raw_frame = kwargs.get("raw_frame", None)
        self.step_count = int(kwargs.get("step_count", 0))
        self.player_name = kwargs.get("player_name", "RED")
        self.rival_name = kwargs.get("rival_name", "BLUE")

    @property
    def x(self) -> int:
        return self.player_x

    @property
    def y(self) -> int:
        return self.player_y

    @property
    def party_hp_ratio(self) -> float:
        return self.total_party_hp_ratio

    @property
    def dialogue_open(self) -> bool:
        return self.has_dialogue

    @property
    def battle_status(self) -> int:
        return 1 if self.in_battle else 0

    @property
    def badges(self) -> int:
        return self.badges_count

    def to_feature_vector(self) -> np.ndarray:
        """
        Compact normalized feature vector for tabular or linear RL models.
        Length: 10 dimensions.
        """
        mode_encoding = {
            "INTRO": 0.0,
            "FADING": 0.1,
            "OVERWORLD": 0.4,
            "DIALOGUE": 0.6,
            "MENU": 0.7,
            "BATTLE": 1.0
        }.get(self.mode, 0.5)

        facing_encoding = {"down": 0.0, "up": 0.25, "left": 0.5, "right": 0.75}.get(self.facing, 0.0)

        vec = np.array([
            mode_encoding,
            float(self.map_id) / 60.0,
            float(self.player_x) / 30.0,
            float(self.player_y) / 30.0,
            facing_encoding,
            1.0 if self.in_battle else 0.0,
            float(self.party_count) / 6.0,
            float(self.lead_hp_ratio),
            float(self.badges_count) / 8.0,
            1.0 if (self.has_dialogue or self.has_menu) else 0.0
        ], dtype=np.float32)
        return vec


class StateBuilder:
    def __init__(self, vision_pipeline=None, ram_telemetry=None):
        try:
            from .screen_vision import ScreenVision
            from .ram_telemetry import RamTelemetry
        except (ImportError, ValueError):
            from observations.screen_vision import ScreenVision
            from observations.ram_telemetry import RamTelemetry

        self.vision = vision_pipeline or ScreenVision()
        self.ram = ram_telemetry
        self.step_counter = 0

    def build(self, adapter_or_emu=None, include_raw_frame: bool = False) -> GameObservation:
        """Convenience method accepting adapter directly."""
        if adapter_or_emu is not None:
            try:
                from .ram_telemetry import RamTelemetry
            except (ImportError, ValueError):
                from observations.ram_telemetry import RamTelemetry
            self.ram = RamTelemetry(adapter_or_emu)

        return self.build_observation(include_raw_frame=include_raw_frame)

    def build_observation(self, include_raw_frame: bool = False) -> GameObservation:
        self.step_counter += 1
        ram_data = self.ram.read_all()
        raw_frame = self.ram.emu.get_screen_ndarray()
        cv_data = self.vision.analyze_frame(raw_frame)

        # Mode Resolution
        is_fading = ram_data["is_screen_faded"] or cv_data["is_fading"]
        is_intro = ram_data["is_intro"]
        in_battle = ram_data["in_battle"] or cv_data["has_battle_hud"]
        has_dialogue = ram_data["font_loaded"] or cv_data["has_textbox"]
        has_menu = cv_data["has_menu"]

        # Classification hierarchy
        if is_fading:
            mode = "FADING"
        elif is_intro:
            mode = "INTRO"
        elif in_battle:
            mode = "BATTLE"
        elif has_dialogue:
            mode = "DIALOGUE"
        elif has_menu:
            mode = "MENU"
        else:
            mode = "OVERWORLD"

        # Calculate party health
        party = ram_data["party"]
        lead_hp = party[0]["hp_ratio"] if party else 1.0
        total_hp = sum(p["hp_ratio"] for p in party) / max(1, len(party)) if party else 1.0

        # Confidence: check agreement between CV and RAM
        agreements = 0
        total_checks = 3
        if in_battle == cv_data["has_battle_hud"]: agreements += 1
        if has_dialogue == cv_data["has_textbox"]: agreements += 1
        if is_fading == cv_data["is_fading"]: agreements += 1
        confidence = float(agreements / total_checks)

        return GameObservation(
            mode=mode,
            map_id=ram_data["map_id"],
            map_name=ram_data["map_name"],
            player_x=ram_data["x"],
            player_y=ram_data["y"],
            facing=ram_data["facing"],
            in_battle=in_battle,
            party_count=ram_data["party_count"],
            party=party,
            lead_hp_ratio=lead_hp,
            total_party_hp_ratio=total_hp,
            badges_count=ram_data["badges_count"],
            money=ram_data["money"],
            has_dialogue=has_dialogue,
            has_menu=has_menu,
            is_fading=is_fading,
            confidence=confidence,
            raw_frame=raw_frame if include_raw_frame else None,
            step_count=self.step_counter,
            player_name=ram_data.get("trainer_name", "RED"),
            rival_name=ram_data.get("rival_name", "BLUE")
        )
