from .molecules import router as molecules_router
from .reactions import router as reactions_router
from .experiments import router as experiments_router
from .files import router as files_router
from .docking import router as docking_router
from .optimization import router as optimization_router
from .version_control import router as version_control_router

__all__ = [
    "molecules_router",
    "reactions_router",
    "experiments_router",
    "files_router",
    "docking_router",
    "optimization_router",
    "version_control_router",
]
