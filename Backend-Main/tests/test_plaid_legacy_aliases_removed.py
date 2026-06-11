from app.controllers.plaid import router as plaid_router


def test_legacy_plaid_item_alias_removed():
    assert not any(
        getattr(route, "path", None) == "/item" and "DELETE" in getattr(route, "methods", set())
        for route in plaid_router.routes
    )
