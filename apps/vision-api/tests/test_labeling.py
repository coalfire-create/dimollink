"""Label Studio 설정이 자재 분류 v1·위험 유형과 일치하는지 (기획서 §4.3)."""

import os
import xml.etree.ElementTree as ET

from app.taxonomy import HAZARD_TYPES, MATERIAL_CODES

CONFIG = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "labeling",
    "label_studio_config.xml",
)


def _values(root, tag, name):
    node = next(n for n in root.iter(tag) if n.get("name") == name)
    child = "Label" if tag == "RectangleLabels" else "Choice"
    return {c.get("value") for c in node.iter(child)}


def test_config_well_formed():
    ET.parse(CONFIG)  # 예외 없으면 well-formed


def test_material_labels_match_taxonomy():
    root = ET.parse(CONFIG).getroot()
    assert _values(root, "RectangleLabels", "materials") == set(MATERIAL_CODES)


def test_hazard_choices_match_taxonomy():
    root = ET.parse(CONFIG).getroot()
    assert _values(root, "Choices", "hazards") == set(HAZARD_TYPES)
