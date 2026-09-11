earthengine-vscode-map
======================

Python bridge to the interactive map panel of the `Earth Engine VS Code extension`_.

The extension embeds a Leaflet map with a Python bridge server. This package
exposes a ``Map`` module that mirrors the Earth Engine Code Editor API
(``Map.addLayer``, ``Map.centerObject``, ``Map.setCenter``, ``Map.clear``)
and forwards the calls to that bridge. All Earth Engine graphs are serialised
locally and evaluated by the extension host — the Python side never resolves
tile URLs.

Usage
-----

.. code-block:: python

    import ee
    from earthengine_vscode_map import Map

    ee.Initialize(project="my-project")

    image = ee.Image("COPERNICUS/S2_SR/20200101T100319_20200101T100321_T32TQM")
    Map.addLayer(image, {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}, "RGB")
    Map.centerObject(image, zoom=10)

Requirements
------------

- Python ``>=3.9``
- The Earth Engine VS Code extension installed and active
- A valid ``ee.Initialize(project=...)`` call before any ``Map.*`` invocation

Install
-------

From the repository root:

.. code-block:: bash

    pip install -e python_package/

License
-------

Apache License 2.0 — see ``LICENSE``.

.. _Earth Engine VS Code extension: https://github.com/12rambau/earthengine-extension
