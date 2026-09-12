import pytest

from airline_ops.config import Settings
from airline_ops.spark import create_spark


@pytest.fixture(scope="session")
def spark():
    session = create_spark(Settings(), name="airline-pytest")
    yield session
    session.stop()
