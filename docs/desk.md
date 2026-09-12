# Zuri's desk

Field connects a request, an execution and its evidence in one workspace. Open `/desk`, choose a cup and ask Zuri to place it on the tray. You can also send the same request from `/space`. The supported commands are **put**, **place** and **move**, with the green, violet (or purple), or coral cup as the object and the tray as the destination.

## Execution and verification

The virtual desk is a deterministic reference controller. It reads object positions again before grasping; rearranging the objects between approach and grasp forces a new observation. Its final check requires the object to be within the tray boundary, on the table plane, with an empty gripper. Scene interpolation animates committed states; it cannot authorize success. This is not a learned manipulation policy or a physics engine.

A physical desk uses the same task ledger with a separate device adapter. The browser never calls a motor endpoint. A paired bridge makes outbound requests to Field, claims a task once and asks a local controller for one bounded action at a time. An expired lease produces an unknown outcome requiring recovery. It does not requeue a physical movement.

The device may report `running`, `awaiting_verification`, `failed` or `stopped`. It cannot report `succeeded`. Physical placement requires a fresh camera frame and confirmation from the workspace owner. The record identifies this as **operator verification**, not an independent visual model measurement. A hardware stop button remains necessary: a browser stop request is not an emergency stop.

## Connect a physical desk

1. Start Field and apply its local database migrations.
2. Start the GUMI web operator from Show-Harness on the robot computer. Use the matching robot and camera configuration, configure its vision model and keep the operator bound to loopback. Its `dry_run` setting must be false and it must be idle and paused. Field does not install robot drivers, calibrate a camera, or choose a motor configuration.
3. In **Desk → Connection**, select **Pair a physical desk** and copy the bridge key. It is displayed once; the database stores only its digest. Pairing again rotates it. Switching to the virtual desk revokes it.
4. In the downloaded source directory on that computer, configure the bridge. Keep the key in a private environment file or enter it in the terminal; do not place it in source control.

```sh
export FIELD_DESK_URL=http://localhost:3001
export FIELD_DESK_OPERATOR=http://127.0.0.1:8090
export FIELD_DESK_CAMERA=agentview
read -s FIELD_DESK_KEY
export FIELD_DESK_KEY
npm run desk:bridge
```

The connection check does not accept tasks. At the physical desk, with the workspace clear and the local stop control available, run:

```sh
npm run desk:bridge -- --arm
```

Set `FIELD_DESK_URL` to an HTTPS Field origin when the website runs on another machine. The bridge authenticates outbound traffic; it does not expose the robot's unauthenticated control server. The operator URL must remain loopback. The first camera is normally `agentview`; use an actual configured view name. Preview frames must be JPEG and at most 256 KiB.

The bridge limits each task to 40 steps or four minutes. It sends fresh camera evidence after each completed step and refreshes the frame during a one-minute placement review. An unresolved task stops the bridge. Physical motion must be reconciled locally before another task is accepted.

## Recovery

A private journal at `~/.field/desk-execution.json` is written before the first device command. Network failure or an uncertain command response leaves the journal intact. The adapter never automatically retries `/api/step`, `/api/task` or recording controls.

After inspecting the actual hardware, stop it locally, resolve the task in Field and restart with `--acknowledge-stopped --arm`. This option checks that the remote task is closed and the local controller is paused and idle before clearing the journal. The journal is outside the downloadable source archive.

## API contract

| Endpoint                            | Authentication                               | Purpose                                                              |
| ----------------------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| `GET /api/desk`                     | Workspace session                            | Read committed state; advance the virtual controller                 |
| `POST /api/desk`                    | Workspace session and same origin            | Start, rearrange, stop, review, pair, switch workspace, or reconcile |
| `POST /api/desk/bridge`             | Paired bearer credential                     | Claim one task, send a heartbeat, or report an execution             |
| `POST /api/desk/media`              | Paired bearer credential and execution lease | Store an immutable camera frame or recording                         |
| `GET /api/desk/media/{task}/{file}` | Owning workspace session                     | Read private evidence                                                |

Task submission includes a client-generated UUID. Reusing the UUID with the same normalized instruction returns the same task; changing its instruction is rejected. D1 compare-and-swap updates serialize competing submissions and claims. A transition callback cannot make external calls.

Media uploads include `X-Task-Id`, `X-Execution-Lease` and `X-Captured-At` (Unix milliseconds). The response supplies a relative evidence URL, capture timestamp and monotonic sequence number. JPEG frames are capped at 256 KiB, WebM/MP4 recordings at 4 MiB, and each task at 120 uploads / 40 MiB. Upload attempts reserve their allowance before object storage, so a failed upload can consume allowance. Immutable media paths prevent a later frame from replacing evidence already reviewed. Device reports validate local media ownership and capture timestamps before attaching it to the task.

Physical execution uses the operator's `/api/status`, `/api/task`, `/api/record/start`, `/api/step`, `/api/pause` and `/api/live/{view}` interfaces. An `executed` event permits another observation and step. `saved` or `complete_not_saved` opens placement review; a rejected, stale or unknown outcome stops execution. Field retains the camera sequence for replay. Full-rate recordings remain in the controller's recording storage unless a device integration uploads a recording through the media endpoint.

## Storage and deployment

`desk_sessions` keeps scoped task records in D1, independent of conversation revisions. The local `DESK_MEDIA` R2 binding stores image and video bytes. Browser views, exported records and model context never include the bridge digest or execution lease. Model context contains the last three task summaries, their mode and verification source; it carries no camera image, credential or authority to drive hardware.

The workspace retains up to 100 tasks, with bounded event history. Replay shows recorded observations and committed virtual states, not reconstructed physical positions. Export a task from its history panel. Evidence URLs remain private to the owning workspace session.

Local development uses the `DESK_MEDIA` R2 binding. Vercel stores private evidence in D1 through the authenticated database adapter. Media is split into bounded chunks and becomes readable only after every chunk is stored. Keys are immutable and include the owning workspace. Images are limited to 256 KiB and video segments to 4 MiB; longer recordings remain on the device. A failed upload cannot certify a task.

## Verification

`npm run check` covers command idempotency, concurrent claims, visitor isolation, private evidence, expiry, cancellation, placement review, changed object positions, character migration and the bounded device adapter. Its HTTP tests use a temporary database, local object storage and fixture evidence. No physical robot or live model is used by this suite. Hardware calibration, grasp performance and emergency-stop behavior must be verified on the actual equipment.
