# Copilot instructions for this repository

## Mandatory interaction protocol (from root `copilot-instructions.md`)

- Call `ASK_USER` before ending every response.
- After completing a request, immediately use `ASK_USER` to propose a context-relevant next step.
- If anything is uncertain, do not guess; use `ASK_USER` to clarify.
- Do not end a response without calling `ASK_USER`.
- Do not use closing phrases such as “hope this helps” or “let me know if you need anything else.”
- Do not infer user intent when unclear; ask explicitly.
- Even when a task appears complete, use `ASK_USER` to ask whether edge-case testing or code optimization is needed.
- Each `ASK_USER` prompt must provide at least 3 mutually exclusive next-step options.
- Stay in this interaction loop until the user explicitly enters `EXIT`.
- `ASK_USER` prompts must be directly relevant to current context, concrete, and actionable; prefer options to reduce user input effort.

## Build, test, and lint commands

This project is Makefile-driven (no CMake, no package manager scripts).

| Task | Command | Notes |
|---|---|---|
| Build all modules | `make` | Builds root shared-memory object, then `pcie` and `udp` modules. |
| Build only shared memory | `make shared_memory` | Produces `build/shared_memory.o` used by submodules. |
| Build only PCIe module | `make pcie ENABLE_RENDERING=1` | Submodule build via root orchestration. |
| Build only UDP module | `make udp` | Builds `udp/build/udp_sender`. |
| Debug build | `make debug` | Runs debug target in both submodules. |
| Release build | `make release` | Runs release target in both submodules. |
| Install outputs | `make install` | Copies binaries to `build/bin` and model folder into `build/`. |
| Test all | `make test` | Aggregates `test-pcie` + `test-udp`. |
| Single test: UDP | `make test-udp` | Actually executes UDP sender test target. |
| Single test: PCIe | `make test-pcie` | Prints how to run PCIe executable manually. |
| Run full pipeline foreground | `make run` | Starts PCIe producer + UDP sender pipeline. |
| Run full pipeline background | `make run-background` | Starts both modules with logs in `pcie/pcie.log` and `udp/udp.log`. |
| Stop running pipeline | `make stop` | Stops processes and clears IPC resources. |
| System/runtime status | `make status` / `make check-system` | Build/run/shared-memory checks. |
| Clean | `make clean` / `make distclean` | `distclean` also stops processes and removes logs. |

Linting:
- No dedicated lint target or formatter target is defined in Makefiles.

## High-level architecture

The runtime pipeline is:

`PCIe DMA capture -> YOLO inference/overlay -> shared memory (RGB565) -> UDP packetization -> network sender`

### Orchestration layer
- Root `Makefile` coordinates three pieces:
  1. Root shared-memory implementation (`csrc/shared_memory.c`)
  2. PCIe capture/inference app (`pcie/build/pcie_capture`)
  3. UDP sender app (`udp/build/udp_sender`)
- Data flow documented in root Makefile help: PCIe -> Shared Memory -> UDP -> network.

### Shared memory contract (cross-module ABI)
- ABI lives in `include/shared_memory.h`, implementation in `csrc/shared_memory.c`.
- Two primary image segments:
  - `SHM_PCIE_IMAGE_KEY` for PCIe-produced frames.
  - `SHM_UDP_IMAGE_KEY` for UDP-related frame exchange.
- Optional curve-detection segment: `SHM_CURVE_DETECTION_KEY`.
- Control block includes `frame_id`, `frame_ready`, `writer_active`, dimensions, timestamp, and checksum.
- Reader/writer lifecycle uses SysV SHM (`shmget/shmat/shmctl`); writer cleanup removes SHM segment.

### PCIe module (`pcie/`)
- `pcie/csrc/main.cpp` opens `/dev/pango_pci_driver`, performs DMA reads with ioctl commands from `pcie/include/pcie_dma_read_test.h`, converts RGB565 -> RGB888, runs RKNN-based detection (`yolo_integration`), draws overlays, converts back to RGB565, and writes frames into shared memory.
- Model/runtime assets are local to `pcie/model/` and `pcie/lib/` (not fetched dynamically).
- Optional X11 rendering path exists (compile-time macro path), while core pipeline can run without display.

### UDP module (`udp/`)
- `udp/csrc/main.cpp` connects as shared-memory reader, pulls PCIe frames, converts format, and transmits frame-synchronized UDP stream to target host/port.
- Wire protocol is custom and per-frame structured (frame header, per-line headers+payloads, frame trailer) with checksums/magic values defined in code.

## Key conventions in this codebase

- Image geometry is fixed to `640x480` across PCIe, shared-memory structs, and UDP protocol constants; treat this as a cross-module contract unless all modules are updated together.
- Shared-memory read APIs use tri-state return semantics:
  - `0` = new frame read successfully
  - `1` = no new frame available
  - `-1` = error/integrity failure
- Shared-memory write flow is ordered: set `frame_ready=0` -> copy payload -> compute/update control metadata -> set `frame_ready=1`.
- Frame integrity is checked by additive checksum on both producer and consumer paths; checksum mismatch is treated as read failure.
- Root builds pass `TOPDIR` into sub-makes so module builds can include root headers and link root `build/shared_memory.o`.
- Runtime/network defaults are embedded in source/scripts (for example UDP default target `192.168.100.20:8888` and network setup script values), so behavior changes usually require editing source/script constants, not only command-line flags.
- Hardware/runtime assumptions are Linux-specific: SysV IPC (`ipcs/ipcrm`), `/dev/pango_pci_driver`, and shell targets that use Unix tools.
