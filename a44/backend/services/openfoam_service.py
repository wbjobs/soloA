import asyncio
import subprocess
import os
import shutil
import re
import uuid
from pathlib import Path
from typing import Dict, Optional, List
from config import settings


class OpenFOAMService:
    def __init__(self):
        self.foam_root = Path(settings.OPENFOAM_ROOT)
        self.foam_version = settings.OPENFOAM_VERSION
        self.foam_env = self._get_foam_env()

    def _get_foam_env(self) -> Dict[str, str]:
        env = os.environ.copy()
        foam_sh = self.foam_root / self.foam_version / "etc" / "bashrc"
        if foam_sh.exists():
            env["FOAM_INST_DIR"] = str(self.foam_root)
            env["WM_PROJECT_VERSION"] = self.foam_version
        return env

    async def _run_command(self, command: List[str], cwd: Optional[Path] = None) -> subprocess.CompletedProcess:
        proc = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(cwd) if cwd else None,
            env=self.foam_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        return subprocess.CompletedProcess(
            args=command,
            returncode=proc.returncode,
            stdout=stdout.decode(),
            stderr=stderr.decode()
        )

    def _create_blockmesh_dict(self, case_dir: Path, mesh_size: List[float]) -> Path:
        dict_path = case_dir / "system" / "blockMeshDict"
        content = f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      blockMeshDict;
}}

convertToMeters 1;

vertices
(
    (0 0 0)
    ({mesh_size[0]} 0 0)
    ({mesh_size[0]} {mesh_size[1]} 0)
    (0 {mesh_size[1]} 0)
    (0 0 {mesh_size[2]})
    ({mesh_size[0]} 0 {mesh_size[2]})
    ({mesh_size[0]} {mesh_size[1]} {mesh_size[2]})
    (0 {mesh_size[1]} {mesh_size[2]})
);

blocks
(
    hex (0 1 2 3 4 5 6 7) (20 20 20) simpleGrading (1 1 1)
);

edges
(
);

boundary
(
    inlet
    {{
        type patch;
        faces
        (
            (0 4 7 3)
        );
    }}
    outlet
    {{
        type patch;
        faces
        (
            (2 6 5 1)
        );
    }}
    walls
    {{
        type wall;
        faces
        (
            (0 1 5 4)
            (1 2 6 5)
            (2 3 7 6)
            (0 3 7 4)
        );
    }}
);

mergePatchPairs
(
);
"""
        dict_path.write_text(content)
        return dict_path

    def _create_snappy_dict(self, case_dir: Path, refinement_level: int, stl_name: str) -> Path:
        dict_path = case_dir / "system" / "snappyHexMeshDict"
        content = f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      snappyHexMeshDict;
}}

castellatedMesh true;
snap            true;
addLayers       false;

geometry
{{
    {stl_name}
    {{
        type triSurfaceMesh;
        file "{stl_name}";
    }}
}};

castellatedMeshControls
{{
    maxLocalCells 1000000;
    maxGlobalCells 2000000;
    minRefinementCells 10;
    maxLoadUnbalance 0.10;
    nCellsBetweenLevels 1;
    
    features
    (
    );
    
    refinementSurfaces
    {{
        {stl_name}
        {{
            level ({refinement_level} {refinement_level});
        }}
    }}
    
    resolveFeatureAngle 30;
    refinementRegions
    {{
    }}
    
    locationInMesh (0.5 0.5 0.5);
    allowFreeStandingZoneFaces true;
}}

snapControls
{{
    nSmoothPatch 3;
    tolerance 2.0;
    nSolveIter 30;
    nRelaxIter 5;
    nFeatureSnapIter 10;
    implicitFeatureSnap false;
    explicitFeatureSnap true;
    multiRegionFeatureSnap true;
}}

addLayersControls
{{
    relativeSizes true;
    layers
    {{
    }}
    expansionRatio 1.0;
    finalLayerThickness 0.3;
    minThickness 0.1;
    nGrow 0;
    featureAngle 130;
    nRelaxIter 3;
    nSmoothSurfaceNormals 1;
    nSmoothNormals 3;
    nSmoothThickness 10;
    maxFaceThicknessRatio 0.5;
    maxThicknessToMedialRatio 0.3;
    minMedialAxisAngle 90;
    nBufferCellsNoExtrude 0;
    nLayerIter 50;
}}

meshQualityControls
{{
    maxNonOrtho 65;
    maxBoundarySkewness 20;
    maxInternalSkewness 4;
    maxConcave 80;
    minVol 1e-13;
    minTetQuality 1e-15;
    minArea -1;
    minTwist 0.02;
    minDeterminant 0.001;
    minFaceWeight 0.05;
    minVolRatio 0.01;
    minTriangleTwist -1;
    nSmoothScale 4;
    errorReduction 0.75;
    relaxed
    {{
        maxNonOrtho 75;
    }}
}}

mergeTolerance 1e-6;
"""
        dict_path.write_text(content)
        return dict_path

    def _create_control_dict(self, case_dir: Path, solver_config: Dict) -> Path:
        dict_path = case_dir / "system" / "controlDict"
        content = f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      controlDict;
}}

application     {solver_config.get('solver', 'simpleFoam')};

startFrom       latestTime;

startTime       0;

stopAt          endTime;

endTime         {solver_config.get('end_time', 1000)};

deltaT          {solver_config.get('delta_t', 1)};

writeControl    timeStep;

writeInterval   {solver_config.get('write_interval', 100)};

purgeWrite      0;

writeFormat     ascii;

writePrecision  6;

writeCompression off;

timeFormat      general;

timePrecision   6;

runTimeModifiable true;
"""
        dict_path.write_text(content)
        return dict_path

    def _create_fv_schemes(self, case_dir: Path, turbulence_model: str) -> Path:
        dict_path = case_dir / "system" / "fvSchemes"
        content = f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      fvSchemes;
}}

ddtSchemes
{{
    default         steadyState;
}}

gradSchemes
{{
    default         Gauss linear;
    grad(p)         Gauss linear;
}}

divSchemes
{{
    default         none;
    div(phi,U)      Gauss linearUpwind grad(U);
    div(phi,k)      Gauss upwind;
    div(phi,epsilon) Gauss upwind;
    div((nuEff*dev2(T(grad(U))))) Gauss linear;
}}

laplacianSchemes
{{
    default         Gauss linear corrected;
}}

interpolationSchemes
{{
    default         linear;
}}

snGradSchemes
{{
    default         corrected;
}}

fluxRequired
{{
    default         no;
    p_rgh;
    p;
}}
"""
        dict_path.write_text(content)
        return dict_path

    def _create_fv_solution(self, case_dir: Path) -> Path:
        dict_path = case_dir / "system" / "fvSolution"
        content = """FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      fvSolution;
}

solvers
{
    p_rgh
    {
        solver          GAMG;
        smoother        DIC;
        tolerance       1e-06;
        relTol          0.1;
    }

    p
    {
        solver          GAMG;
        smoother        DIC;
        tolerance       1e-06;
        relTol          0.1;
    }

    U
    {
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-05;
        relTol          0;
    }

    k
    {
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-05;
        relTol          0;
    }

    epsilon
    {
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-05;
        relTol          0;
    }

    omega
    {
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-05;
        relTol          0;
    }
}

SIMPLE
{
    nNonOrthogonalCorrectors 0;
    pRefCell        0;
    pRefValue       0;
}

relaxationFactors
{
    equations
    {
        U               0.7;
        k               0.7;
        epsilon         0.7;
        omega           0.7;
    }
}
"""
        dict_path.write_text(content)
        return dict_path

    def _create_boundary_files(self, case_dir: Path, boundary_conditions: List[Dict], patch_names: List[str]):
        zero_dir = case_dir / "0"
        zero_dir.mkdir(exist_ok=True)
        
        U_content = """FoamFile
{
    version     2.0;
    format      ascii;
    class       volVectorField;
    location    "0";
    object      U;
}

dimensions      [0 1 -1 0 0 0 0];

internalField   uniform (0 0 0);

boundaryField
{
"""
        
        p_content = """FoamFile
{
    version     2.0;
    format      ascii;
    class       volScalarField;
    location    "0";
    object      p;
}

dimensions      [0 2 -2 0 0 0 0];

internalField   uniform 0;

boundaryField
{
"""

        k_content = """FoamFile
{
    version     2.0;
    format      ascii;
    class       volScalarField;
    location    "0";
    object      k;
}

dimensions      [0 2 -2 0 0 0 0];

internalField   uniform 0.1;

boundaryField
{
"""

        epsilon_content = """FoamFile
{
    version     2.0;
    format      ascii;
    class       volScalarField;
    location    "0";
    object      epsilon;
}

dimensions      [0 2 -3 0 0 0 0];

internalField   uniform 0.1;

boundaryField
{
"""

        bc_map = {bc["name"]: bc for bc in boundary_conditions}

        for patch in patch_names:
            bc = bc_map.get(patch, {"type": "wall", "parameters": {}})
            bc_type = bc["type"]
            params = bc.get("parameters", {})

            if bc_type == "velocity_inlet":
                vel = params.get("velocity", [0, 0, 1])
                U_content += f'    {patch}\n    {{\n        type            fixedValue;\n        value           uniform ({vel[0]} {vel[1]} {vel[2]});\n    }}\n'
                p_content += f'    {patch}\n    {{\n        type            zeroGradient;\n    }}\n'
                k_content += f'    {patch}\n    {{\n        type            fixedValue;\n        value           uniform {params.get("k", 0.1)};\n    }}\n'
                epsilon_content += f'    {patch}\n    {{\n        type            fixedValue;\n        value           uniform {params.get("epsilon", 0.1)};\n    }}\n'
            elif bc_type == "pressure_outlet":
                U_content += f'    {patch}\n    {{\n        type            zeroGradient;\n    }}\n'
                p_content += f'    {patch}\n    {{\n        type            fixedValue;\n        value           uniform {params.get("pressure", 0)};\n    }}\n'
                k_content += f'    {patch}\n    {{\n        type            zeroGradient;\n    }}\n'
                epsilon_content += f'    {patch}\n    {{\n        type            zeroGradient;\n    }}\n'
            elif bc_type == "symmetry":
                for content in [U_content, p_content, k_content, epsilon_content]:
                    content += f'    {patch}\n    {{\n        type            symmetry;\n    }}\n'
            else:
                U_content += f'    {patch}\n    {{\n        type            noSlip;\n    }}\n'
                p_content += f'    {patch}\n    {{\n        type            zeroGradient;\n    }}\n'
                k_content += f'    {patch}\n    {{\n        type            kqRWallFunction;\n        value           uniform 0;\n    }}\n'
                epsilon_content += f'    {patch}\n    {{\n        type            epsilonWallFunction;\n        value           uniform 0;\n    }}\n'

        U_content += "}\n"
        p_content += "}\n"
        k_content += "}\n"
        epsilon_content += "}\n"

        (zero_dir / "U").write_text(U_content)
        (zero_dir / "p").write_text(p_content)
        (zero_dir / "k").write_text(k_content)
        (zero_dir / "epsilon").write_text(epsilon_content)

    async def generate_mesh(
        self,
        case_id: str,
        stl_path: Optional[Path],
        mesh_config: Dict,
        progress_callback
    ) -> Dict:
        case_dir = Path(settings.CASES_DIR) / case_id
        case_dir.mkdir(parents=True, exist_ok=True)
        (case_dir / "system").mkdir(exist_ok=True)
        (case_dir / "constant").mkdir(exist_ok=True)
        (case_dir / "constant" / "triSurface").mkdir(exist_ok=True)

        await progress_callback(0.0, "Initializing case directory...")

        self._create_blockmesh_dict(case_dir, mesh_config.get("base_mesh_size", [10, 10, 10]))

        await progress_callback(0.1, "Running blockMesh...")
        result = await self._run_command(["blockMesh"], cwd=case_dir)
        if result.returncode != 0:
            raise Exception(f"blockMesh failed: {result.stderr}")

        await progress_callback(0.3, "blockMesh completed")

        if stl_path and mesh_config.get("method") == "snappyHexMesh":
            stl_name = f"geometry.stl"
            shutil.copy(stl_path, case_dir / "constant" / "triSurface" / stl_name)

            self._create_snappy_dict(
                case_dir,
                mesh_config.get("refinement_level", 2),
                stl_name
            )

            await progress_callback(0.4, "Running snappyHexMesh (castellated)...")
            result = await self._run_command(
                ["snappyHexMesh", "-overwrite", "-dict", "system/snappyHexMeshDict"],
                cwd=case_dir
            )
            if result.returncode != 0:
                raise Exception(f"snappyHexMesh failed: {result.stderr}")

            await progress_callback(0.8, "snappyHexMesh completed")

        await progress_callback(0.9, "Checking mesh quality...")
        result = await self._run_command(["checkMesh", "-latestTime"], cwd=case_dir)

        mesh_quality = self._parse_checkmesh_output(result.stdout)

        await progress_callback(1.0, "Mesh generation completed")

        return {
            "case_dir": str(case_dir),
            "mesh_quality": mesh_quality
        }

    def _parse_checkmesh_output(self, output: str) -> Dict:
        quality = {
            "n_cells": 0,
            "n_faces": 0,
            "n_points": 0,
            "mesh_ok": True,
            "non_ortho_max": 0,
            "skewness_max": 0,
            "aspect_ratio_max": 0
        }

        cell_match = re.search(r"^\s*Cells\s*:\s*(\d+)", output, re.MULTILINE)
        if cell_match:
            quality["n_cells"] = int(cell_match.group(1))

        face_match = re.search(r"^\s*Faces\s*:\s*(\d+)", output, re.MULTILINE)
        if face_match:
            quality["n_faces"] = int(face_match.group(1))

        point_match = re.search(r"^\s*Points\s*:\s*(\d+)", output, re.MULTILINE)
        if point_match:
            quality["n_points"] = int(point_match.group(1))

        non_ortho_match = re.search(r"non-orthogonality max = (\d+)", output)
        if non_ortho_match:
            quality["non_ortho_max"] = float(non_ortho_match.group(1))

        skewness_match = re.search(r"Max skewness = ([\d.]+)", output)
        if skewness_match:
            quality["skewness_max"] = float(skewness_match.group(1))

        if "Mesh OK" not in output:
            quality["mesh_ok"] = False

        return quality

    async def run_solver(
        self,
        case_id: str,
        solver_config: Dict,
        boundary_conditions: List[Dict],
        patch_names: List[str],
        progress_callback,
        log_callback
    ) -> Dict:
        case_dir = Path(settings.CASES_DIR) / case_id

        self._create_control_dict(case_dir, solver_config)
        self._create_fv_schemes(case_dir, solver_config.get("turbulence_model", "kEpsilon"))
        self._create_fv_solution(case_dir)
        self._create_boundary_files(case_dir, boundary_conditions, patch_names)

        await progress_callback(0.0, "Starting solver...")

        solver = solver_config.get("solver", "simpleFoam")
        proc = await asyncio.create_subprocess_exec(
            solver,
            cwd=str(case_dir),
            env=self.foam_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT
        )

        log_file = case_dir / f"log.{solver}"
        with open(log_file, "w") as f:
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                line_str = line.decode()
                f.write(line_str)
                f.flush()

                log_entry = self._parse_log_line(line_str)
                if log_entry:
                    await log_callback(log_entry)

                    residual_match = re.search(r"Time = (\d+)", line_str)
                    if residual_match:
                        time = int(residual_match.group(1))
                        end_time = solver_config.get("end_time", 1000)
                        progress = min(time / end_time, 0.95)
                        await progress_callback(progress, f"Solving at time = {time}")

        await proc.wait()

        if proc.returncode != 0:
            raise Exception(f"Solver failed with code {proc.returncode}")

        await progress_callback(1.0, "Solver completed")

        return {
            "log_file": str(log_file),
            "status": "completed"
        }

    def _parse_log_line(self, line: str) -> Optional[Dict]:
        time_match = re.search(r"Time = (\d+)", line)
        if not time_match:
            return None

        time = float(time_match.group(1))
        residuals = {}

        residual_patterns = [
            r"(p|p_rgh):\s*Initial residual = ([\d.e+-]+)",
            r"U[x-z]?:\s*Initial residual = ([\d.e+-]+)",
            r"k:\s*Initial residual = ([\d.e+-]+)",
            r"epsilon:\s*Initial residual = ([\d.e+-]+)",
            r"omega:\s*Initial residual = ([\d.e+-]+)"
        ]

        for var, pat in zip(["p", "Ux", "Uy", "Uz", "k", "epsilon", "omega"], residual_patterns):
            match = re.search(pat, line)
            if match:
                residuals[var] = float(match.group(1 if len(match.groups()) == 1 else 2))

        exec_time_match = re.search(r"ExecutionTime = ([\d.]+) s", line)
        execution_time = float(exec_time_match.group(1)) if exec_time_match else 0

        return {
            "time": time,
            "residuals": residuals,
            "execution_time": execution_time
        }


openfoam_service = OpenFOAMService()
