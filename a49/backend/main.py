from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.routers import simulations, bodies, exports
from app.simulation.engine import simulation_manager
import json

app = FastAPI(title="N-Body Simulation API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(simulations.router, prefix="/api/simulations", tags=["simulations"])
app.include_router(bodies.router, prefix="/api/bodies", tags=["bodies"])
app.include_router(exports.router, prefix="/api/exports", tags=["exports"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict = {}

    async def connect(self, websocket: WebSocket, sim_id: int):
        await websocket.accept()
        if sim_id not in self.active_connections:
            self.active_connections[sim_id] = []
        self.active_connections[sim_id].append(websocket)

    def disconnect(self, websocket: WebSocket, sim_id: int):
        if sim_id in self.active_connections:
            self.active_connections[sim_id].remove(websocket)

    async def broadcast(self, sim_id: int, message: dict):
        if sim_id in self.active_connections:
            for connection in self.active_connections[sim_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except:
                    pass


manager = ConnectionManager()


@app.websocket("/ws/simulation/{sim_id}")
async def websocket_endpoint(websocket: WebSocket, sim_id: int):
    await manager.connect(websocket, sim_id)
    try:
        if not simulation_manager.has_simulation(sim_id):
            await websocket.send_text(json.dumps({
                "error": f"Simulation {sim_id} not loaded"
            }))

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            action = message.get("action")

            if action == "step":
                steps = message.get("steps", 1)
                if simulation_manager.has_simulation(sim_id):
                    sim = simulation_manager.get_simulation(sim_id)
                    state = sim.step(steps)
                    await manager.broadcast(sim_id, state.to_dict())

            elif action == "get_state":
                if simulation_manager.has_simulation(sim_id):
                    sim = simulation_manager.get_simulation(sim_id)
                    await websocket.send_text(json.dumps(sim.get_state().to_dict()))

            elif action == "pause":
                if simulation_manager.has_simulation(sim_id):
                    sim = simulation_manager.get_simulation(sim_id)
                    sim.pause()
                    await manager.broadcast(sim_id, {"status": "paused"})

            elif action == "resume":
                if simulation_manager.has_simulation(sim_id):
                    sim = simulation_manager.get_simulation(sim_id)
                    sim.resume()
                    await manager.broadcast(sim_id, {"status": "running"})

            elif action == "set_time_scale":
                scale = message.get("scale", 1.0)
                if simulation_manager.has_simulation(sim_id):
                    sim = simulation_manager.get_simulation(sim_id)
                    sim.set_time_scale(scale)
                    await manager.broadcast(sim_id, {"time_scale": scale, "dt": sim.config.dt})

    except WebSocketDisconnect:
        manager.disconnect(websocket, sim_id)


@app.get("/")
def root():
    return {"message": "N-Body Simulation API is running"}
