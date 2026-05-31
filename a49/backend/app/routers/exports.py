from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from typing import Optional
import io
import json
from app.simulation.engine import simulation_manager

router = APIRouter()


@router.get("/{sim_id}/json")
def export_json(sim_id: int):
    if not simulation_manager.has_simulation(sim_id):
        raise HTTPException(status_code=404, detail="Simulation not loaded in memory")

    sim = simulation_manager.get_simulation(sim_id)
    data = sim.export_history("json")

    output = io.BytesIO()
    output.write(json.dumps(data, indent=2).encode('utf-8'))
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=simulation_{sim_id}.json"}
    )


@router.get("/{sim_id}/csv")
def export_csv(sim_id: int):
    if not simulation_manager.has_simulation(sim_id):
        raise HTTPException(status_code=404, detail="Simulation not loaded in memory")

    sim = simulation_manager.get_simulation(sim_id)
    csv_data = sim.export_history("csv")

    output = io.BytesIO()
    output.write(csv_data.encode('utf-8'))
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=simulation_{sim_id}.csv"}
    )


@router.get("/{sim_id}/current")
def get_current_state_export(sim_id: int):
    if not simulation_manager.has_simulation(sim_id):
        raise HTTPException(status_code=404, detail="Simulation not loaded in memory")

    sim = simulation_manager.get_simulation(sim_id)
    state = sim.get_state()

    return {
        "simulation_id": sim_id,
        "step": state.step,
        "time": state.time,
        "bodies": [
            {
                "id": i,
                "name": state.names[i] if i < len(state.names) else f"Body_{i}",
                "mass": float(state.masses[i]),
                "radius": float(state.radii[i]),
                "position": {
                    "x": float(state.positions[i, 0]),
                    "y": float(state.positions[i, 1]),
                    "z": float(state.positions[i, 2])
                },
                "velocity": {
                    "x": float(state.velocities[i, 0]),
                    "y": float(state.velocities[i, 1]),
                    "z": float(state.velocities[i, 2])
                },
                "color": state.colors[i] if i < len(state.colors) else "#ffffff"
            }
            for i in range(len(state.masses))
        ]
    }
