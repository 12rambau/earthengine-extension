<div align="center">

<img src="resources/icon.png" alt="Earth Engine for VS Code" width="128" />

# Earth Engine for VS Code

**Google Earth Engine directly inside your editor.**

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-v0.6.3-007ACC?style=flat-square&logoColor=white&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4Ij48bWFzayBpZD0iYSIgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIHg9IjAiIHk9IjAiIG1hc2tVbml0cz0idXNlclNwYWNlT25Vc2UiIHN0eWxlPSJtYXNrLXR5cGU6YWxwaGEiPjxwYXRoIGZpbGw9IiNmZmYiIGZpbGwtcnVsZT0iZXZlbm9kZCIgZD0iTTkwLjc2NyAxMjcuMTI2YTcuOTY4IDcuOTY4IDAgMCAwIDYuMzUtLjI0NGwyNi4zNTMtMTIuNjgxYTggOCAwIDAgMCA0LjUzLTcuMjA5VjIxLjAwOWE4IDggMCAwIDAtNC41My03LjIxTDk3LjExNyAxLjEyYTcuOTcgNy45NyAwIDAgMC05LjA5MyAxLjU0OGwtNTAuNDUgNDYuMDI2TDE1LjYgMzIuMDEzYTUuMzI4IDUuMzI4IDAgMCAwLTYuODA3LjMwMmwtNy4wNDggNi40MTFhNS4zMzUgNS4zMzUgMCAwIDAtLjAwNiA3Ljg4OEwyMC43OTYgNjQgMS43NCA4MS4zODdhNS4zMzYgNS4zMzYgMCAwIDAgLjAwNiA3Ljg4N2w3LjA0OCA2LjQxMWE1LjMyNyA1LjMyNyAwIDAgMCA2LjgwNy4zMDNsMjEuOTc0LTE2LjY4IDUwLjQ1IDQ2LjAyNWE3Ljk2IDcuOTYgMCAwIDAgMi43NDMgMS43OTNabTUuMjUyLTkyLjE4M0w1Ny43NCA2NGwzOC4yOCAyOS4wNThWMzQuOTQzWiIgY2xpcC1ydWxlPSJldmVub2RkIi8+PC9tYXNrPjxnIG1hc2s9InVybCgjYSkiPjxwYXRoIGZpbGw9IiMwMDY1QTkiIGQ9Ik0xMjMuNDcxIDEzLjgyIDk3LjA5NyAxLjEyQTcuOTczIDcuOTczIDAgMCAwIDg4IDIuNjY4TDEuNjYyIDgxLjM4N2E1LjMzMyA1LjMzMyAwIDAgMCAuMDA2IDcuODg3bDcuMDUyIDYuNDExYTUuMzMzIDUuMzMzIDAgMCAwIDYuODExLjMwM2wxMDMuOTcxLTc4Ljg3NWMzLjQ4OC0yLjY0NiA4LjQ5OC0uMTU4IDguNDk4IDQuMjJ2LS4zMDZhOC4wMDEgOC4wMDEgMCAwIDAtNC41MjktNy4yMDhaIi8+PGcgZmlsdGVyPSJ1cmwoI2IpIj48cGF0aCBmaWxsPSIjMDA3QUNDIiBkPSJtMTIzLjQ3MSAxMTQuMTgxLTI2LjM3NCAxMi42OThBNy45NzMgNy45NzMgMCAwIDEgODggMTI1LjMzM0wxLjY2MiA0Ni42MTNhNS4zMzMgNS4zMzMgMCAwIDEgLjAwNi03Ljg4N2w3LjA1Mi02LjQxMWE1LjMzMyA1LjMzMyAwIDAgMSA2LjgxMS0uMzAzbDEwMy45NzEgNzguODc0YzMuNDg4IDIuNjQ3IDguNDk4LjE1OSA4LjQ5OC00LjIxOXYuMzA2YTguMDAxIDguMDAxIDAgMCAxLTQuNTI5IDcuMjA4WiIvPjwvZz48ZyBmaWx0ZXI9InVybCgjYykiPjxwYXRoIGZpbGw9IiMxRjlDRjAiIGQ9Ik05Ny4wOTggMTI2Ljg4MkE3Ljk3NyA3Ljk3NyAwIDAgMSA4OCAxMjUuMzMzYzIuOTUyIDIuOTUyIDggLjg2MSA4LTMuMzE0VjUuOThjMC00LjE3NS01LjA0OC02LjI2Ni04LTMuMzEzYTcuOTc3IDcuOTc3IDAgMCAxIDkuMDk4LTEuNTQ5TDEyMy40NjcgMTMuOEE4IDggMCAwIDEgMTI4IDIxLjAxdjg1Ljk4MmE4IDggMCAwIDEtNC41MzMgNy4yMWwtMjYuMzY5IDEyLjY4MVoiLz48L2c+PHBhdGggZmlsbD0idXJsKCNkKSIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNOTAuNjkgMTI3LjEyNmE3Ljk2OCA3Ljk2OCAwIDAgMCA2LjM0OS0uMjQ0bDI2LjM1My0xMi42ODFhOCA4IDAgMCAwIDQuNTMtNy4yMVYyMS4wMDlhOCA4IDAgMCAwLTQuNTMtNy4yMUw5Ny4wMzkgMS4xMmE3Ljk3IDcuOTcgMCAwIDAtOS4wOTMgMS41NDhsLTUwLjQ1IDQ2LjAyNi0yMS45NzQtMTYuNjhhNS4zMjggNS4zMjggMCAwIDAtNi44MDcuMzAybC03LjA0OCA2LjQxMWE1LjMzNiA1LjMzNiAwIDAgMC0uMDA2IDcuODg4TDIwLjcxOCA2NCAxLjY2MiA4MS4zODZhNS4zMzUgNS4zMzUgMCAwIDAgLjAwNiA3Ljg4OGw3LjA0OCA2LjQxMWE1LjMyOCA1LjMyOCAwIDAgMCA2LjgwNy4zMDNsMjEuOTc1LTE2LjY4MSA1MC40NSA0Ni4wMjZhNy45NTkgNy45NTkgMCAwIDAgMi43NDIgMS43OTNabTUuMjUyLTkyLjE4NEw1Ny42NjIgNjRsMzguMjggMjkuMDU3VjM0Ljk0M1oiIGNsaXAtcnVsZT0iZXZlbm9kZCIgb3BhY2l0eT0iMC4yNSIgc3R5bGU9Im1peC1ibGVuZC1tb2RlOm92ZXJsYXkiLz48L2c+PGRlZnM+PGZpbHRlciBpZD0iYiIgd2lkdGg9IjE0NC43NDQiIGhlaWdodD0iMTEzLjQwOCIgeD0iLTguNDExMTUiIHk9IjIyLjU5NDQiIGNvbG9yLWludGVycG9sYXRpb24tZmlsdGVycz0ic1JHQiIgZmlsdGVyVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48ZmVGbG9vZCBmbG9vZC1vcGFjaXR5PSIwIiByZXN1bHQ9IkJhY2tncm91bmRJbWFnZUZpeCIvPjxmZUNvbG9yTWF0cml4IGluPSJTb3VyY2VBbHBoYSIgcmVzdWx0PSJoYXJkQWxwaGEiIHZhbHVlcz0iMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMTI3IDAiLz48ZmVPZmZzZXQvPjxmZUdhdXNzaWFuQmx1ciBzdGREZXZpYXRpb249IjQuMTY2NjciLz48ZmVDb2xvck1hdHJpeCB2YWx1ZXM9IjAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAuMjUgMCIvPjxmZUJsZW5kIGluMj0iQmFja2dyb3VuZEltYWdlRml4IiBtb2RlPSJvdmVybGF5IiByZXN1bHQ9ImVmZmVjdDFfZHJvcFNoYWRvd18xXzM2Ii8+PGZlQmxlbmQgaW49IlNvdXJjZUdyYXBoaWMiIGluMj0iZWZmZWN0MV9kcm9wU2hhZG93XzFfMzYiIHJlc3VsdD0ic2hhcGUiLz48L2ZpbHRlcj48ZmlsdGVyIGlkPSJjIiB3aWR0aD0iNTYuNjY2NyIgaGVpZ2h0PSIxNDQuMDA3IiB4PSI3OS42NjY3IiB5PSItOC4wMDM1IiBjb2xvci1pbnRlcnBvbGF0aW9uLWZpbHRlcnM9InNSR0IiIGZpbHRlclVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGZlRmxvb2QgZmxvb2Qtb3BhY2l0eT0iMCIgcmVzdWx0PSJCYWNrZ3JvdW5kSW1hZ2VGaXgiLz48ZmVDb2xvck1hdHJpeCBpbj0iU291cmNlQWxwaGEiIHJlc3VsdD0iaGFyZEFscGhhIiB2YWx1ZXM9IjAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDEyNyAwIi8+PGZlT2Zmc2V0Lz48ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSI0LjE2NjY3Ii8+PGZlQ29sb3JNYXRyaXggdmFsdWVzPSIwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwLjI1IDAiLz48ZmVCbGVuZCBpbjI9IkJhY2tncm91bmRJbWFnZUZpeCIgbW9kZT0ib3ZlcmxheSIgcmVzdWx0PSJlZmZlY3QxX2Ryb3BTaGFkb3dfMV8zNiIvPjxmZUJsZW5kIGluPSJTb3VyY2VHcmFwaGljIiBpbjI9ImVmZmVjdDFfZHJvcFNoYWRvd18xXzM2IiByZXN1bHQ9InNoYXBlIi8+PC9maWx0ZXI+PGxpbmVhckdyYWRpZW50IGlkPSJkIiB4MT0iNjMuOTIyMiIgeDI9IjYzLjkyMjIiIHkxPSIwLjMyOTkwMiIgeTI9IjEyNy42NyIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPjxzdG9wIHN0b3AtY29sb3I9IiNmZmYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmZmYiIHN0b3Atb3BhY2l0eT0iMCIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjwvc3ZnPg==)](https://marketplace.visualstudio.com/items?itemName=12rambau.earthengine)
[![Open VSX](https://img.shields.io/open-vsx/v/12rambau/earthengine?style=flat-square&label=Open%20VSX&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDYgMTMzIj4KICA8cGF0aCBkPSJNMzAgNDQuMkw1Mi42IDVINy4zek00LjYgODguNWg0NS4zTDI3LjIgNDkuNHptNTEgMGwyMi42IDM5LjIgMjIuNi0zOS4yeiIgZmlsbD0iI2MxNjBlZiIvPgogIDxwYXRoIGQ9Ik01Mi42IDVMMzAgNDQuMmg0NS4yek0yNy4yIDQ5LjRsMjIuNyAzOS4xIDIyLjYtMzkuMXptNTEgMEw1NS42IDg4LjVoNDUuMnoiIGZpbGw9IiNhNjBlZTUiLz4KPC9zdmc+)](https://open-vsx.org/extension/12rambau/earthengine)

[![License](https://img.shields.io/github/license/12rambau/earthengine-extension?style=flat-square&logo=apache&logoColor=white)](https://github.com/12rambau/earthengine-extension/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.125+-007ACC?style=flat-square&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4Ij48bWFzayBpZD0iYSIgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIHg9IjAiIHk9IjAiIG1hc2tVbml0cz0idXNlclNwYWNlT25Vc2UiIHN0eWxlPSJtYXNrLXR5cGU6YWxwaGEiPjxwYXRoIGZpbGw9IiNmZmYiIGZpbGwtcnVsZT0iZXZlbm9kZCIgZD0iTTkwLjc2NyAxMjcuMTI2YTcuOTY4IDcuOTY4IDAgMCAwIDYuMzUtLjI0NGwyNi4zNTMtMTIuNjgxYTggOCAwIDAgMCA0LjUzLTcuMjA5VjIxLjAwOWE4IDggMCAwIDAtNC41My03LjIxTDk3LjExNyAxLjEyYTcuOTcgNy45NyAwIDAgMC05LjA5MyAxLjU0OGwtNTAuNDUgNDYuMDI2TDE1LjYgMzIuMDEzYTUuMzI4IDUuMzI4IDAgMCAwLTYuODA3LjMwMmwtNy4wNDggNi40MTFhNS4zMzUgNS4zMzUgMCAwIDAtLjAwNiA3Ljg4OEwyMC43OTYgNjQgMS43NCA4MS4zODdhNS4zMzYgNS4zMzYgMCAwIDAgLjAwNiA3Ljg4N2w3LjA0OCA2LjQxMWE1LjMyNyA1LjMyNyAwIDAgMCA2LjgwNy4zMDNsMjEuOTc0LTE2LjY4IDUwLjQ1IDQ2LjAyNWE3Ljk2IDcuOTYgMCAwIDAgMi43NDMgMS43OTNabTUuMjUyLTkyLjE4M0w1Ny43NCA2NGwzOC4yOCAyOS4wNThWMzQuOTQzWiIgY2xpcC1ydWxlPSJldmVub2RkIi8+PC9tYXNrPjxnIG1hc2s9InVybCgjYSkiPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0xMjMuNDcxIDEzLjgyIDk3LjA5NyAxLjEyQTcuOTczIDcuOTczIDAgMCAwIDg4IDIuNjY4TDEuNjYyIDgxLjM4N2E1LjMzMyA1LjMzMyAwIDAgMCAuMDA2IDcuODg3bDcuMDUyIDYuNDExYTUuMzMzIDUuMzMzIDAgMCAwIDYuODExLjMwM2wxMDMuOTcxLTc4Ljg3NWMzLjQ4OC0yLjY0NiA4LjQ5OC0uMTU4IDguNDk4IDQuMjJ2LS4zMDZhOC4wMDEgOC4wMDEgMCAwIDAtNC41MjktNy4yMDhaIi8+PGcgZmlsdGVyPSJ1cmwoI2IpIj48cGF0aCBmaWxsPSIjZmZmIiBkPSJtMTIzLjQ3MSAxMTQuMTgxLTI2LjM3NCAxMi42OThBNy45NzMgNy45NzMgMCAwIDEgODggMTI1LjMzM0wxLjY2MiA0Ni42MTNhNS4zMzMgNS4zMzMgMCAwIDEgLjAwNi03Ljg4N2w3LjA1Mi02LjQxMWE1LjMzMyA1LjMzMyAwIDAgMSA2LjgxMS0uMzAzbDEwMy45NzEgNzguODc0YzMuNDg4IDIuNjQ3IDguNDk4LjE1OSA4LjQ5OC00LjIxOXYuMzA2YTguMDAxIDguMDAxIDAgMCAxLTQuNTI5IDcuMjA4WiIvPjwvZz48ZyBmaWx0ZXI9InVybCgjYykiPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik05Ny4wOTggMTI2Ljg4MkE3Ljk3NyA3Ljk3NyAwIDAgMSA4OCAxMjUuMzMzYzIuOTUyIDIuOTUyIDggLjg2MSA4LTMuMzE0VjUuOThjMC00LjE3NS01LjA0OC02LjI2Ni04LTMuMzEzYTcuOTc3IDcuOTc3IDAgMCAxIDkuMDk4LTEuNTQ5TDEyMy40NjcgMTMuOEE4IDggMCAwIDEgMTI4IDIxLjAxdjg1Ljk4MmE4IDggMCAwIDEtNC41MzMgNy4yMWwtMjYuMzY5IDEyLjY4MVoiLz48L2c+PHBhdGggZmlsbD0idXJsKCNkKSIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNOTAuNjkgMTI3LjEyNmE3Ljk2OCA3Ljk2OCAwIDAgMCA2LjM0OS0uMjQ0bDI2LjM1My0xMi42ODFhOCA4IDAgMCAwIDQuNTMtNy4yMVYyMS4wMDlhOCA4IDAgMCAwLTQuNTMtNy4yMUw5Ny4wMzkgMS4xMmE3Ljk3IDcuOTcgMCAwIDAtOS4wOTMgMS41NDhsLTUwLjQ1IDQ2LjAyNi0yMS45NzQtMTYuNjhhNS4zMjggNS4zMjggMCAwIDAtNi44MDcuMzAybC03LjA0OCA2LjQxMWE1LjMzNiA1LjMzNiAwIDAgMC0uMDA2IDcuODg4TDIwLjcxOCA2NCAxLjY2MiA4MS4zODZhNS4zMzUgNS4zMzUgMCAwIDAgLjAwNiA3Ljg4OGw3LjA0OCA2LjQxMWE1LjMyOCA1LjMyOCAwIDAgMCA2LjgwNy4zMDNsMjEuOTc1LTE2LjY4MSA1MC40NSA0Ni4wMjZhNy45NTkgNy45NTkgMCAwIDAgMi43NDIgMS43OTNabTUuMjUyLTkyLjE4NEw1Ny42NjIgNjRsMzguMjggMjkuMDU3VjM0Ljk0M1oiIGNsaXAtcnVsZT0iZXZlbm9kZCIgb3BhY2l0eT0iMC4yNSIgc3R5bGU9Im1peC1ibGVuZC1tb2RlOm92ZXJsYXkiLz48L2c+PGRlZnM+PGZpbHRlciBpZD0iYiIgd2lkdGg9IjE0NC43NDQiIGhlaWdodD0iMTEzLjQwOCIgeD0iLTguNDExMTUiIHk9IjIyLjU5NDQiIGNvbG9yLWludGVycG9sYXRpb24tZmlsdGVycz0ic1JHQiIgZmlsdGVyVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48ZmVGbG9vZCBmbG9vZC1vcGFjaXR5PSIwIiByZXN1bHQ9IkJhY2tncm91bmRJbWFnZUZpeCIvPjxmZUNvbG9yTWF0cml4IGluPSJTb3VyY2VBbHBoYSIgcmVzdWx0PSJoYXJkQWxwaGEiIHZhbHVlcz0iMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMTI3IDAiLz48ZmVPZmZzZXQvPjxmZUdhdXNzaWFuQmx1ciBzdGREZXZpYXRpb249IjQuMTY2NjciLz48ZmVDb2xvck1hdHJpeCB2YWx1ZXM9IjAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAuMjUgMCIvPjxmZUJsZW5kIGluMj0iQmFja2dyb3VuZEltYWdlRml4IiBtb2RlPSJvdmVybGF5IiByZXN1bHQ9ImVmZmVjdDFfZHJvcFNoYWRvd18xXzM2Ii8+PGZlQmxlbmQgaW49IlNvdXJjZUdyYXBoaWMiIGluMj0iZWZmZWN0MV9kcm9wU2hhZG93XzFfMzYiIHJlc3VsdD0ic2hhcGUiLz48L2ZpbHRlcj48ZmlsdGVyIGlkPSJjIiB3aWR0aD0iNTYuNjY2NyIgaGVpZ2h0PSIxNDQuMDA3IiB4PSI3OS42NjY3IiB5PSItOC4wMDM1IiBjb2xvci1pbnRlcnBvbGF0aW9uLWZpbHRlcnM9InNSR0IiIGZpbHRlclVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGZlRmxvb2QgZmxvb2Qtb3BhY2l0eT0iMCIgcmVzdWx0PSJCYWNrZ3JvdW5kSW1hZ2VGaXgiLz48ZmVDb2xvck1hdHJpeCBpbj0iU291cmNlQWxwaGEiIHJlc3VsdD0iaGFyZEFscGhhIiB2YWx1ZXM9IjAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDEyNyAwIi8+PGZlT2Zmc2V0Lz48ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSI0LjE2NjY3Ii8+PGZlQ29sb3JNYXRyaXggdmFsdWVzPSIwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwLjI1IDAiLz48ZmVCbGVuZCBpbjI9IkJhY2tncm91bmRJbWFnZUZpeCIgbW9kZT0ib3ZlcmxheSIgcmVzdWx0PSJlZmZlY3QxX2Ryb3BTaGFkb3dfMV8zNiIvPjxmZUJsZW5kIGluPSJTb3VyY2VHcmFwaGljIiBpbjI9ImVmZmVjdDFfZHJvcFNoYWRvd18xXzM2IiByZXN1bHQ9InNoYXBlIi8+PC9maWx0ZXI+PGxpbmVhckdyYWRpZW50IGlkPSJkIiB4MT0iNjMuOTIyMiIgeDI9IjYzLjkyMjIiIHkxPSIwLjMyOTkwMiIgeTI9IjEyNy42NyIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPjxzdG9wIHN0b3AtY29sb3I9IiNmZmYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmZmYiIHN0b3Atb3BhY2l0eT0iMCIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjwvc3ZnPg==)](https://code.visualstudio.com/)
[![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Earth Engine](https://img.shields.io/badge/Earth%20Engine-REST%20API%20v1-4285F4?style=flat-square&logo=googleearthengine&logoColor=white)](https://developers.google.com/earth-engine)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-FE5196?style=flat-square&logo=conventionalcommits&logoColor=white)](https://conventionalcommits.org)
[![code style: prettier](https://img.shields.io/badge/code%20style-prettier-F7B93E?style=flat-square&logo=prettier&logoColor=white)](https://prettier.io)
[![ESLint](https://img.shields.io/badge/linter-ESLint-4B32C3?style=flat-square&logo=eslint&logoColor=white)](https://eslint.org)

</div>

---

Bring the power of [Google Earth Engine](https://earthengine.google.com/) into VS Code. Browse your assets, monitor tasks, explore the STAC dataset catalog, search API docs, and visualize geospatial data on an interactive map — all without leaving your editor.

---

## Features

### 🔐 Authentication — User accounts & Service accounts

Sign in with your Google account via OAuth2 (notebook PKCE flow) or add a service account key file. Multiple profiles are supported simultaneously — switch the active profile with one click.

- Green dot = active profile, red dot = inactive
- Credentials stored securely in `~/.config/earthengine/profiles/`
- Works with any Earth Engine-enabled Google Cloud project

---

### 🗂️ Asset Browser

Navigate your Earth Engine asset hierarchy directly in the sidebar.

- Lazy-loaded tree view with spinner placeholders for large asset libraries
- Supports **Images**, **ImageCollections**, **Tables (FeatureCollections)**, **Folders**
- **Preview panel**: inspect bands, properties, and features without writing a line of code
- **Asset Manager panel**: paginated table view, sortable columns, breadcrumb navigation
- Create subfolders inline via the **New Folder** button
- Copy any asset ID to clipboard in one click

---

### ✅ Task Monitor

Keep an eye on your export and import jobs without switching to the Code Editor.

- Separate **Export Tasks** and **Import Tasks** sidebar panels
- Paginated task list (10 per page) with auto-refresh every 15 seconds
- Status icons: running, completed, failed, cancelled, pending
- Cancel a running task directly from the sidebar or the full table panel
- Full **Tasks Panel**: sortable by any column, paginated top & bottom

---

### 🌍 Dataset Catalog

Browse the full Earth Engine STAC catalog without leaving VS Code.

- Three provider tiers: **Google**, **Publishers**, **Community**
- Lazy background resolution of dataset types (image, image collection, table…)
- **Dataset detail panel**: bands table, tags, code snippet, and direct link to the official catalog page
- Copy any dataset ID to clipboard

---

### 📖 API Docs

Searchable, offline-first Earth Engine JavaScript API reference.

- Hierarchical tree: `ee.Image`, `ee.FeatureCollection`, `ee.Reducer`…
- Rich tooltips per method: description, argument names & types, return type
- Search across all `ee.*` symbols instantly

---

### 🗺️ Interactive Map

Visualize Earth Engine layers on an interactive Leaflet map inside a VS Code panel.

- Three built-in base layers: OpenStreetMap, Satellite (ESRI), Terrain (ESRI)
- Layer control: toggle visibility, adjust opacity, remove layers
- **Python bridge**: a local HTTP server on port `31415` accepts commands from your Python scripts

#### Python usage

```python
import sys
sys.path.insert(0, "/path/to/extension/python")
from earthengine_vscode_map import Map

vis = {"min": 0, "max": 3000, "bands": ["B4", "B3", "B2"]}
Map.addLayer(ee_image.getMapId(vis)["tile_fetcher"].url_format, vis, "Landsat")
Map.centerObject(geometry, zoom=8)
```

---

## Requirements

- **VS Code** 1.125 or later
- A [Google Earth Engine](https://signup.earthengine.google.com/) account
- A Google Cloud project with the **Earth Engine API** enabled
- **Python** (optional) — only needed for the map Python bridge

---

## Getting Started

1. Install the extension from the VS Code Marketplace
2. Click the **Earth Engine** icon in the Activity Bar
3. In the **Profiles** panel, click **Add Profile** ($(person-add)) to sign in with Google
   — or click **Add Service Account** ($(file-add)) to use a service account key
4. Select the profile to activate it (green dot = active)
5. Your assets, tasks, docs, and datasets will load automatically

---

## Extension Commands

| Command                     | Description                                    |
| --------------------------- | ---------------------------------------------- |
| `Add Profile`               | Sign in with a Google account via OAuth2       |
| `Add Service Account`       | Register a service account key file            |
| `Activate Profile`          | Switch to a different Earth Engine profile     |
| `Open Asset Manager`        | Open the full paginated asset table panel      |
| `Open Map View`             | Open the interactive Leaflet map panel         |
| `New Folder`                | Create a folder in your Earth Engine assets    |
| `Copy Asset ID`             | Copy a full asset name to clipboard            |
| `Open Details` (dataset)    | Open the STAC dataset detail panel             |
| `Open in Browser` (dataset) | Open the dataset page on developers.google.com |
| `Cancel Task`               | Cancel a running export or import task         |

---

## Extension Settings

| Setting      | Default | Description                                |
| ------------ | ------- | ------------------------------------------ |
| _(none yet)_ | —       | Settings will be added in a future release |

---

## Known Issues & Limitations

- The interactive map requires an active internet connection to load tile layers (CDN)
- The Python bridge server listens on `localhost:31415` — ensure the port is free
- Service account private keys are stored in `~/.config/earthengine/profiles/` in plain JSON (same location as the official `earthengine` CLI)
- API Docs are fetched from `developers.google.com` and cached for the session

---

## Community Catalog

The **Community** tier of the Dataset Catalog is powered by the
[Awesome GEE Community Catalog](https://gee-community-catalog.org/), an open collection of
community-contributed Earth Engine datasets curated by
[Samapriya Roy](https://github.com/samapriya) and contributors.

**License:** The catalog is distributed under the
[Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://github.com/samapriya/awesome-gee-community-datasets/blob/master/LICENSE)
license. You are free to use, share, and adapt the catalog data as long as appropriate credit is
given.

**Citation:** If you use datasets from the community catalog in your work, please cite it as
requested by the project maintainer. Full citation details are available on the
[reference page](https://gee-community-catalog.org/reference/).

---

## Development

This project uses a **Dev Container** for a consistent development environment.

### Prerequisites

- [VS Code](https://code.visualstudio.com/)
- [Docker](https://www.docker.com/) (running)
- [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/your-org/earthengine-vscode
# Open in VS Code and reopen in Dev Container when prompted
```

- Press `F5` to launch the **Extension Development Host**
- The default build task (`Ctrl+Shift+B`) runs `watch:esbuild` and `watch:tsc` in parallel

### Useful Commands

| Command            | Description                     |
| ------------------ | ------------------------------- |
| `npx tsc --noEmit` | Type-check without emitting     |
| `node esbuild.js`  | Production build                |
| `npm run lint`     | Run ESLint on `src/`            |
| `npm run package`  | Bundle for publishing (`.vsix`) |

---

## Release Notes

See [CHANGELOG.md](https://github.com/12rambau/earthengine-extension/blob/main/CHANGELOG.md) for the full history.

---

<div align="center">

Made with ❤️ for the Earth Engine community

</div>
