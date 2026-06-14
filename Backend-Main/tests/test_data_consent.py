from types import SimpleNamespace

from app.services.data_consent import (
    DATA_STORAGE_CONSENT_VERSION,
    apply_data_storage_consent,
    should_persist_user_data,
)


def test_should_persist_user_data_requires_explicit_true():
    assert should_persist_user_data(SimpleNamespace(data_storage_consent=True)) is True
    assert should_persist_user_data(SimpleNamespace(data_storage_consent=False)) is False
    assert should_persist_user_data(SimpleNamespace()) is False


def test_apply_data_storage_consent_records_opt_in_metadata():
    user = SimpleNamespace()

    apply_data_storage_consent(user, True)

    assert user.data_storage_consent is True
    assert user.data_storage_consent_version == DATA_STORAGE_CONSENT_VERSION
    assert user.data_storage_consent_at is not None


def test_apply_data_storage_consent_clears_timestamp_on_opt_out():
    user = SimpleNamespace(data_storage_consent_at=object())

    apply_data_storage_consent(user, False)

    assert user.data_storage_consent is False
    assert user.data_storage_consent_version is None
    assert user.data_storage_consent_at is None
