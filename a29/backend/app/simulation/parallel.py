import numpy as np
from typing import Dict, Any, List, Tuple, Optional
from dataclasses import dataclass

try:
    from mpi4py import MPI
    MPI_AVAILABLE = True
except ImportError:
    MPI_AVAILABLE = False


@dataclass
class MeshPartition:
    """Data structure for a single mesh partition."""
    rank: int
    local_nodes: np.ndarray
    local_elements: np.ndarray
    interface_nodes: List[int]
    ghost_nodes: List[int]
    global_to_local: Dict[int, int]
    local_to_global: Dict[int, int]
    interface_ranks: Dict[int, List[int]]


class DomainDecomposer:
    """Domain decomposition for MPI parallel computing."""

    def __init__(self, comm=None):
        if MPI_AVAILABLE:
            self.comm = comm if comm is not None else MPI.COMM_WORLD
            self.rank = self.comm.Get_rank()
            self.size = self.comm.Get_size()
        else:
            self.comm = None
            self.rank = 0
            self.size = 1

    def decompose_rectangular(self, nx: int, ny: int, nprocs: int) -> MeshPartition:
        """
        Decompose a rectangular structured grid.
        Uses simple Cartesian partitioning.
        """
        if nprocs == 1 or not MPI_AVAILABLE:
            all_nodes = np.arange((nx + 1) * (ny + 1))
            all_elements = np.arange(nx * ny)
            return MeshPartition(
                rank=0,
                local_nodes=all_nodes,
                local_elements=all_elements,
                interface_nodes=[],
                ghost_nodes=[],
                global_to_local={i: i for i in all_nodes},
                local_to_global={i: i for i in all_nodes},
                interface_ranks={}
            )

        nx_procs = int(np.sqrt(nprocs))
        ny_procs = nprocs // nx_procs

        px = self.rank % nx_procs
        py = self.rank // nx_procs

        x_start = (px * nx) // nx_procs
        x_end = ((px + 1) * nx) // nx_procs
        y_start = (py * ny) // ny_procs
        y_end = ((py + 1) * ny) // ny_procs

        local_nx = x_end - x_start
        local_ny = y_end - y_start

        local_nodes = []
        global_to_local = {}
        local_to_global = {}
        interface_nodes = []
        interface_ranks = {}

        for j in range(y_start, y_end + 1):
            for i in range(x_start, x_end + 1):
                global_idx = j * (nx + 1) + i
                local_idx = len(local_nodes)
                local_nodes.append(global_idx)
                global_to_local[global_idx] = local_idx
                local_to_global[local_idx] = global_idx

                is_interface = False
                neighbor_ranks = []

                if px > 0 and i == x_start:
                    is_interface = True
                    neighbor_ranks.append(self.rank - 1)
                if px < nx_procs - 1 and i == x_end:
                    is_interface = True
                    neighbor_ranks.append(self.rank + 1)
                if py > 0 and j == y_start:
                    is_interface = True
                    neighbor_ranks.append(self.rank - nx_procs)
                if py < ny_procs - 1 and j == y_end:
                    is_interface = True
                    neighbor_ranks.append(self.rank + nx_procs)

                if is_interface:
                    interface_nodes.append(global_idx)
                    interface_ranks[global_idx] = neighbor_ranks

        local_elements = []
        for j in range(y_start, y_end):
            for i in range(x_start, x_end):
                elem_idx = j * nx + i
                local_elements.append(elem_idx)

        ghost_nodes = []
        for node in interface_nodes:
            for neighbor_rank in interface_ranks[node]:
                if neighbor_rank != self.rank:
                    ghost_nodes.append(node)

        return MeshPartition(
            rank=self.rank,
            local_nodes=np.array(local_nodes, dtype=np.int32),
            local_elements=np.array(local_elements, dtype=np.int32),
            interface_nodes=list(set(interface_nodes)),
            ghost_nodes=list(set(ghost_nodes)),
            global_to_local=global_to_local,
            local_to_global=local_to_global,
            interface_ranks=interface_ranks
        )


class InterfaceSynchronizer:
    """Handles MPI communication for interface nodes."""

    def __init__(self, partition: MeshPartition, comm=None):
        self.partition = partition
        if MPI_AVAILABLE:
            self.comm = comm if comm is not None else MPI.COMM_WORLD
        else:
            self.comm = None

    def synchronize_displacements(self, u: np.ndarray, n_dof: int = 2) -> np.ndarray:
        """
        Synchronize displacement values across MPI partitions.
        For interface nodes, takes the average value from all adjacent partitions.
        """
        if not MPI_AVAILABLE or len(self.partition.interface_nodes) == 0:
            return u

        n_local = len(self.partition.local_nodes)
        u_synced = u.copy()

        interface_local_indices = [
            self.partition.global_to_local[gid]
            for gid in self.partition.interface_nodes
            if gid in self.partition.global_to_local
        ]

        rank_neighbors = set()
        for ranks in self.partition.interface_ranks.values():
            rank_neighbors.update(ranks)

        for neighbor_rank in rank_neighbors:
            if neighbor_rank == self.partition.rank:
                continue

            send_data = []
            for gid in self.partition.interface_nodes:
                if neighbor_rank in self.partition.interface_ranks.get(gid, []):
                    if gid in self.partition.global_to_local:
                        lid = self.partition.global_to_local[gid]
                        for d in range(n_dof):
                            send_data.append(u[lid, d])

            send_data = np.array(send_data, dtype=np.float64)

            req_send = self.comm.Isend(send_data, dest=neighbor_rank, tag=100 + neighbor_rank)

            recv_count = len(send_data)
            recv_data = np.empty(recv_count, dtype=np.float64)
            req_recv = self.comm.Irecv(recv_data, source=neighbor_rank, tag=100 + self.partition.rank)

            req_send.Wait()
            req_recv.Wait()

            idx = 0
            for gid in self.partition.interface_nodes:
                if neighbor_rank in self.partition.interface_ranks.get(gid, []):
                    if gid in self.partition.global_to_local:
                        lid = self.partition.global_to_local[gid]
                        for d in range(n_dof):
                            u_synced[lid, d] = 0.5 * (u_synced[lid, d] + recv_data[idx])
                            idx += 1

        return u_synced

    def gather_results(self, local_u: np.ndarray, n_global_nodes: int, n_dof: int = 2) -> Optional[np.ndarray]:
        """
        Gather results from all partitions to rank 0.
        Only rank 0 gets the full result.
        """
        if not MPI_AVAILABLE:
            return local_u

        if self.partition.rank == 0:
            global_u = np.zeros((n_global_nodes, n_dof), dtype=np.float64)
        else:
            global_u = None

        local_indices = self.partition.local_nodes

        if self.partition.rank == 0:
            global_u[local_indices] = local_u

        for other_rank in range(1, self.comm.Get_size()):
            if self.partition.rank == other_rank:
                self.comm.Send(local_indices, dest=0, tag=200 + other_rank)
                self.comm.Send(local_u, dest=0, tag=300 + other_rank)
            elif self.partition.rank == 0:
                recv_indices = np.empty_like(local_indices)
                recv_u = np.empty_like(local_u)

                self.comm.Recv(recv_indices, source=other_rank, tag=200 + other_rank)
                self.comm.Recv(recv_u, source=other_rank, tag=300 + other_rank)

                for i, gid in enumerate(recv_indices):
                    if gid not in self.partition.global_to_local:
                        global_u[gid] = recv_u[i]

        return global_u
