earthengine-vscode-map
======================

|License| |Python| |Earth Engine| |Ruff| |Conventional Commits| |Documentation|

Python bridge to the interactive map panel of the `Earth Engine VS Code extension`_.

The extension embeds a Leaflet map with a Python bridge server. This package
exposes a ``Map`` module that mirrors the Earth Engine Code Editor API
(``Map.addLayer``, ``Map.centerObject``, ``Map.setCenter``, ``Map.clear``)
and forwards the calls to that bridge. All Earth Engine graphs are serialised
locally and evaluated by the extension host — the Python side never resolves
tile URLs.

.. warning::

    ``vscee.Map`` requires the
    `Earth Engine for VS Code <https://12rambau.github.io/earthengine-extension/>`_
    extension to be active. It cannot be used as a standalone Python mapping
    library outside the VS Code extension.

Usage
-----

.. code-block:: python

    import ee
    from vscee import Map

    ee.Initialize(project="my-project")

    image = ee.Image("COPERNICUS/S2_SR/20200101T100319_20200101T100321_T32TQM")
    Map.addLayer(image, {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}, "RGB")
    Map.centerObject(image, zoom=10)

Requirements
------------

- Python ``>=3.9``
- The Earth Engine VS Code extension installed and active
- A valid ``ee.Initialize(project=...)`` call before any ``Map.*`` invocation

.. _Earth Engine VS Code extension: https://github.com/12rambau/earthengine-extension

.. |Documentation| image:: https://img.shields.io/badge/docs-online-339933?style=flat-square&logo=github&logoColor=white
   :alt: Documentation
   :target: https://12rambau.github.io/earthengine-extension/vscee

.. |License| image:: https://img.shields.io/github/license/12rambau/earthengine-extension?style=flat-square&logo=apache&logoColor=white
   :alt: License
   :target: https://github.com/12rambau/earthengine-extension/blob/main/LICENSE

.. |Python| image:: https://img.shields.io/pypi/pyversions/vscee?style=flat-square&logo=python&logoColor=white
   :alt: PyPI Python Version
   :target: https://pypi.org/project/vscee/

.. |Earth Engine| image:: https://img.shields.io/badge/Earth%20Engine-REST%20API%20v1-4285F4?style=flat-square&logo=googleearthengine&logoColor=white
   :alt: Earth Engine
   :target: https://developers.google.com/earth-engine

.. |Ruff| image:: https://img.shields.io/badge/linter-Ruff-D7FF64?style=flat-square
   :alt: Ruff
   :target: https://docs.astral.sh/ruff/

.. |Conventional Commits| image:: https://img.shields.io/badge/Conventional%20Commits-1.0.0-FE5196?style=flat-square&logo=conventionalcommits&logoColor=white
   :alt: Conventional Commits
   :target: https://conventionalcommits.org
