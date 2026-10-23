"""Regression tests for the Python-to-VS Code map bridge."""

import io
import json
import urllib.error
from email.message import Message
from unittest.mock import Mock

import ee
import pytest

from vscee import Map


@pytest.mark.parametrize(
    "vis_params",
    [
        None,
        {"bands": ["R", "G", "B"], "min": 0, "max": 100},
        {"type": "hsv", "bands": ["H", "S", "V"]},
        {"bands": ["B8"], "palette": ["#000000", "#ffffff"]},
        {"bands": ["class"], "values": [0, 1], "palette": ["#000000", "#ffffff"]},
        {"bands": ["B8"], "breaks": [0, 1, 2], "palette": ["#000000", "#ffffff"]},
        {"default": "Natural Color"},
        {"default": 0},
    ],
    ids=[
        "auto",
        "rgb",
        "hsv",
        "continuous",
        "categorical",
        "intervals",
        "preset",
        "preset-index",
    ],
)
def test_add_layer_image_payload(monkeypatch, data_regression, vis_params):
    """Check the image graph and visualization payload sent to the bridge."""
    image = Mock(spec=ee.Image)
    image.serialize.return_value = '{"type":"Image","id":"TEST/IMAGE"}'
    post = Mock()
    monkeypatch.setattr(Map, "_post", post)

    Map.addLayer(image, vis_params, "Example", shown=False, opacity=0.4)

    post.assert_called_once()
    endpoint, payload = post.call_args.args
    assert endpoint == "addLayer"
    data_regression.check(payload)


@pytest.mark.parametrize(
    "vis_params",
    [
        None,
        {"color": "#336699", "width": 2},
        {"property": "value", "min": 0, "max": 10, "palette": ["#000000", "#ffffff"]},
        {"property": "class", "values": ["a", "b"], "palette": ["#000000", "#ffffff"]},
        {"property": "value", "breaks": [0, 1, 2], "palette": ["#000000", "#ffffff"]},
        {"default": "Natural Color"},
        {"default": 0},
    ],
    ids=[
        "auto",
        "uniform",
        "continuous",
        "categorical",
        "intervals",
        "preset",
        "preset-index",
    ],
)
def test_add_layer_feature_collection_payload(monkeypatch, data_regression, vis_params):
    """Check vector layer payloads without contacting Earth Engine."""
    features = Mock(spec=ee.FeatureCollection)
    features.serialize.return_value = (
        '{"type":"FeatureCollection","id":"TEST/FEATURES"}'
    )
    post = Mock()
    monkeypatch.setattr(Map, "_post", post)

    Map.addLayer(features, vis_params, "Features")

    post.assert_called_once()
    endpoint, payload = post.call_args.args
    assert endpoint == "addLayer"
    data_regression.check(payload)


@pytest.mark.parametrize(
    "vis_params",
    [None, {"default": "Natural Color"}],
    ids=["auto", "preset"],
)
def test_add_layer_image_collection_payload(monkeypatch, data_regression, vis_params):
    """Check that an image collection is mosaicked before it is sent."""
    collection = Mock(spec=ee.ImageCollection)
    image = Mock(spec=ee.Image)
    image.serialize.return_value = '{"type":"Image","id":"TEST/MOSAIC"}'
    collection.mosaic.return_value = image
    post = Mock()
    monkeypatch.setattr(Map, "_post", post)

    Map.addLayer(collection, vis_params)

    collection.mosaic.assert_called_once_with()
    post.assert_called_once()
    endpoint, payload = post.call_args.args
    assert endpoint == "addLayer"
    data_regression.check(payload)


@pytest.mark.parametrize(
    "vis_params",
    [
        {"default": "Natural Color", "bands": ["R", "G", "B"]},
        {"default": 0, "type": "auto"},
    ],
    ids=["with-bands", "with-type"],
)
def test_add_layer_rejects_mixed_preset(monkeypatch, vis_params):
    """Reject direct visualization parameters alongside a stored preset."""
    image = Mock(spec=ee.Image)
    post = Mock()
    monkeypatch.setattr(Map, "_post", post)

    with pytest.raises(ValueError, match="conflicts with its parameters"):
        Map.addLayer(image, vis_params)

    post.assert_not_called()


def test_map_controls_payload(monkeypatch, data_regression):
    """Check the map center and clear commands sent to the bridge."""
    geometry = Mock(spec=ee.Geometry)
    geometry.bounds.return_value.getInfo.return_value = {
        "coordinates": [[[2, 1], [5, 1], [5, 7], [2, 7], [2, 1]]]
    }
    post = Mock()
    monkeypatch.setattr(Map, "_post", post)

    Map.centerObject(geometry, zoom=8)
    Map.setCenter(3.5, 4, zoom=10)
    Map.clear()

    data_regression.check({call.args[0]: call.args[1] for call in post.call_args_list})


def test_post_request_and_response(monkeypatch, data_regression):
    """Check the JSON request and the decoded map server response."""
    urlopen = Mock(return_value=io.BytesIO(b'{"ok":true}'))
    monkeypatch.setattr(Map.urllib.request, "urlopen", urlopen)

    response = Map._post("clear", {})

    request = urlopen.call_args.args[0]
    data_regression.check(
        {
            "request": {
                "url": request.full_url,
                "method": request.get_method(),
                "headers": request.headers,
                "data": json.loads(request.data),
                "timeout": urlopen.call_args.kwargs["timeout"],
            },
            "response": response,
        }
    )


@pytest.mark.parametrize(
    ("error", "expected", "message"),
    [
        (
            urllib.error.HTTPError(Map._BASE_URL, 503, "unavailable", Message(), None),
            RuntimeError,
            "Map server returned HTTP 503",
        ),
        (urllib.error.URLError("refused"), ConnectionError, "Could not reach"),
        (TimeoutError("timed out"), ConnectionError, "Could not reach"),
    ],
    ids=["http", "connection", "timeout"],
)
def test_post_errors(monkeypatch, error, expected, message):
    """Check HTTP and network failures keep distinct error messages."""
    monkeypatch.setattr(Map.urllib.request, "urlopen", Mock(side_effect=error))

    with pytest.raises(expected, match=message) as caught:
        Map._post("clear", {})

    assert caught.value.__cause__ is error


def test_post_invalid_json(monkeypatch):
    """Do not report a malformed response as a connection failure."""
    monkeypatch.setattr(
        Map.urllib.request, "urlopen", Mock(return_value=io.BytesIO(b"not json"))
    )

    with pytest.raises(
        RuntimeError, match="Map server returned a malformed response"
    ) as caught:
        Map._post("clear", {})

    assert isinstance(caught.value.__cause__, json.JSONDecodeError)
