"""Le catalogue du serveur doit rester identique a celui du site (js/config.js)."""

from backend.catalogue import ANNEE_MIN, INDICATEURS, PAYS

from .conftest import appeler_js, avec_node


@avec_node
def test_catalogue_identique_au_site():
    [js] = appeler_js([{"fonction": "catalogue", "args": []}])
    assert js["indicateurs"] == INDICATEURS
    assert js["pays"] == PAYS
    assert js["min"] == ANNEE_MIN
