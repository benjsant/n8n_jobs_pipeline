"""Tests des helpers de tools (parsing/format sans réseau)."""
from agent.tools import _TRANCHE_EFFECTIF, registry_grounding_text


def test_registry_grounding_text_complet():
    data = {
        "denomination": "DECATHLON", "siren": "306138900", "naf": "68.20B",
        "effectif": _TRANCHE_EFFECTIF["52"] + " (en 2023)", "date_creation": "1977-01-01",
        "adresse": "4 BD DE MONS 59650 VILLENEUVE-D'ASCQ", "commune": "VILLENEUVE-D'ASCQ",
    }
    txt = registry_grounding_text(data)
    assert "DECATHLON" in txt and "SIREN 306138900" in txt
    assert "5000 à 9999 salariés" in txt
    assert "NAF 68.20B" in txt
    assert txt.endswith(".")


def test_registry_grounding_text_vide():
    assert registry_grounding_text({}) == ""
    assert registry_grounding_text({"siren": "x"}) == ""  # sans dénomination -> rien
