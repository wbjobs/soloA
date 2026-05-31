using System.Collections.Generic;
using UnityEngine;

namespace DungeonSystem
{
    public class DungeonGenerator : MonoBehaviour
    {
        [Header("Dungeon Settings")]
        [SerializeField] private Vector2Int dungeonSize = new Vector2Int(100, 100);
        [SerializeField] private int minRoomSize = 6;
        [SerializeField] private int maxRoomSize = 12;
        [SerializeField] private int roomCount = 20;
        [SerializeField] private int corridorWidth = 2;
        [SerializeField] private int separation = 3;
        [SerializeField] private int maxRoomPlacementAttempts = 100;

        [Header("Theme Settings")]
        [SerializeField] private bool useThemeManager = true;
        [SerializeField] private DungeonTheme overrideTheme;

        [Header("Tile References (Fallback)")]
        [SerializeField] private GameObject floorTilePrefab;
        [SerializeField] private GameObject wallTilePrefab;
        [SerializeField] private GameObject corridorTilePrefab;

        [Header("Room Types")]
        [Range(0, 1)]
        [SerializeField] private float treasureRoomChance = 0.15f;
        [Range(0, 1)]
        [SerializeField] private float enemyRoomChance = 0.6f;

        private List<RoomData> rooms = new List<RoomData>();
        private List<GameObject> generatedTiles = new List<GameObject>();
        private List<Vector2Int> corridorPositions = new List<Vector2Int>();
        private HashSet<Vector2Int> roomPositions = new HashSet<Vector2Int>();
        private Transform dungeonParent;
        private DungeonTheme activeTheme;

        public List<RoomData> Rooms => rooms;
        public DungeonTheme ActiveTheme => activeTheme;

        public void SetTheme(DungeonTheme theme)
        {
            activeTheme = theme;
        }

        public void GenerateDungeon()
        {
            ClearDungeon();
            InitializeTheme();
            GenerateRooms();
            BuildRoomGraph();
            GenerateCorridors();
            GenerateTiles();
        }

        private void InitializeTheme()
        {
            if (useThemeManager && DungeonThemeManager.Instance != null)
            {
                activeTheme = DungeonThemeManager.Instance.CurrentTheme;
            }
            else if (overrideTheme != null)
            {
                activeTheme = overrideTheme;
            }
        }

        private GameObject GetFloorTile()
        {
            if (activeTheme != null && activeTheme.FloorTilePrefab != null)
            {
                return activeTheme.FloorTilePrefab;
            }
            return floorTilePrefab;
        }

        private GameObject GetWallTile()
        {
            if (activeTheme != null && activeTheme.WallTilePrefab != null)
            {
                return activeTheme.WallTilePrefab;
            }
            return wallTilePrefab;
        }

        private GameObject GetCorridorTile()
        {
            if (activeTheme != null && activeTheme.CorridorTilePrefab != null)
            {
                return activeTheme.CorridorTilePrefab;
            }
            if (corridorTilePrefab != null)
            {
                return corridorTilePrefab;
            }
            return GetFloorTile();
        }

        private void ClearDungeon()
        {
            if (dungeonParent != null)
                DestroyImmediate(dungeonParent.gameObject);

            dungeonParent = new GameObject("Dungeon").transform;
            generatedTiles.Clear();
            corridorPositions.Clear();
            roomPositions.Clear();
            rooms.Clear();
        }

        private void GenerateRooms()
        {
            int placedRooms = 0;
            int attempts = 0;

            while (placedRooms < roomCount && attempts < maxRoomPlacementAttempts * roomCount)
            {
                attempts++;

                Vector2Int size = new Vector2Int(
                    Random.Range(minRoomSize, maxRoomSize),
                    Random.Range(minRoomSize, maxRoomSize)
                );

                Vector2Int position = new Vector2Int(
                    Random.Range(0, dungeonSize.x - size.x),
                    Random.Range(0, dungeonSize.y - size.y)
                );

                RoomData newRoom = new RoomData(placedRooms, position, size);

                bool overlaps = false;
                foreach (var room in rooms)
                {
                    Vector2Int expandedPos = room.Position - Vector2Int.one * separation;
                    Vector2Int expandedSize = room.Size + Vector2Int.one * (separation * 2);
                    RoomData expandedRoom = new RoomData(-1, expandedPos, expandedSize);
                    if (newRoom.Overlaps(expandedRoom))
                    {
                        overlaps = true;
                        break;
                    }
                }

                if (!overlaps)
                {
                    AssignRoomType(newRoom, placedRooms);
                    rooms.Add(newRoom);
                    RegisterRoomPositions(newRoom);
                    placedRooms++;
                }
            }

            if (rooms.Count < 2)
            {
                Debug.LogWarning("Not enough rooms generated! Consider increasing dungeon size or reducing room size.");
            }
        }

        private void RegisterRoomPositions(RoomData room)
        {
            for (int x = room.Position.x; x < room.Position.x + room.Size.x; x++)
            {
                for (int y = room.Position.y; y < room.Position.y + room.Size.y; y++)
                {
                    roomPositions.Add(new Vector2Int(x, y));
                }
            }
        }

        private void AssignRoomType(RoomData room, int placedCount)
        {
            if (placedCount == 0)
            {
                room.Type = RoomType.Start;
            }
            else if (placedCount == roomCount - 1)
            {
                room.Type = RoomType.Boss;
            }
            else
            {
                float rand = Random.value;
                if (rand < treasureRoomChance)
                {
                    room.Type = RoomType.Treasure;
                }
                else if (rand < treasureRoomChance + enemyRoomChance)
                {
                    room.Type = RoomType.Enemy;
                }
                else
                {
                    room.Type = RoomType.Normal;
                }
            }
        }

        private void BuildRoomGraph()
        {
            if (rooms.Count < 2) return;

            List<RoomData> connectedRooms = new List<RoomData> { rooms[0] };
            rooms[0].IsConnected = true;

            while (connectedRooms.Count < rooms.Count)
            {
                float bestDistance = float.MaxValue;
                RoomData bestRoom = null;
                RoomData bestConnectedRoom = null;

                foreach (var room in rooms)
                {
                    if (room.IsConnected) continue;

                    foreach (var connectedRoom in connectedRooms)
                    {
                        float distance = Vector2.Distance(room.Center, connectedRoom.Center);
                        if (distance < bestDistance)
                        {
                            bestDistance = distance;
                            bestRoom = room;
                            bestConnectedRoom = connectedRoom;
                        }
                    }
                }

                if (bestRoom != null)
                {
                    bestRoom.IsConnected = true;
                    bestRoom.ConnectedTo = bestConnectedRoom;
                    connectedRooms.Add(bestRoom);
                }
                else
                {
                    break;
                }
            }
        }

        private void GenerateCorridors()
        {
            if (rooms.Count < 2) return;

            corridorPositions.Clear();

            for (int i = 1; i < rooms.Count; i++)
            {
                RoomData room = rooms[i];
                if (room.ConnectedTo != null)
                {
                    CreateSafeLShapedCorridor(room.Center, room.ConnectedTo.Center);
                }
            }
        }

        private void CreateSafeLShapedCorridor(Vector2Int start, Vector2Int end)
        {
            bool horizontalFirst = Random.value > 0.5f;

            if (horizontalFirst)
            {
                CreateHorizontalSegment(start.x, end.x, start.y);
                CreateVerticalSegment(start.y, end.y, end.x);
            }
            else
            {
                CreateVerticalSegment(start.y, end.y, start.x);
                CreateHorizontalSegment(start.x, end.x, end.y);
            }
        }

        private void CreateHorizontalSegment(int startX, int endX, int y)
        {
            int minX = Mathf.Min(startX, endX);
            int maxX = Mathf.Max(startX, endX);

            for (int x = minX; x <= maxX; x++)
            {
                for (int w = 0; w < corridorWidth; w++)
                {
                    Vector2Int pos = new Vector2Int(x, y + w - corridorWidth / 2);
                    if (IsValidCorridorPosition(pos))
                    {
                        corridorPositions.Add(pos);
                    }
                }
            }
        }

        private void CreateVerticalSegment(int startY, int endY, int x)
        {
            int minY = Mathf.Min(startY, endY);
            int maxY = Mathf.Max(startY, endY);

            for (int y = minY; y <= maxY; y++)
            {
                for (int w = 0; w < corridorWidth; w++)
                {
                    Vector2Int pos = new Vector2Int(x + w - corridorWidth / 2, y);
                    if (IsValidCorridorPosition(pos))
                    {
                        corridorPositions.Add(pos);
                    }
                }
            }
        }

        private bool IsValidCorridorPosition(Vector2Int position)
        {
            if (position.x < 0 || position.x >= dungeonSize.x ||
                position.y < 0 || position.y >= dungeonSize.y)
            {
                return false;
            }

            if (corridorPositions.Contains(position))
            {
                return false;
            }

            if (IsWallPosition(position))
            {
                return false;
            }

            return true;
        }

        private bool IsWallPosition(Vector2Int position)
        {
            foreach (var room in rooms)
            {
                bool isInsideRoom =
                    position.x >= room.Position.x + 1 &&
                    position.x < room.Position.x + room.Size.x - 1 &&
                    position.y >= room.Position.y + 1 &&
                    position.y < room.Position.y + room.Size.y - 1;

                if (isInsideRoom)
                {
                    return false;
                }

                bool isWall =
                    (position.x == room.Position.x && position.y >= room.Position.y && position.y < room.Position.y + room.Size.y) ||
                    (position.x == room.Position.x + room.Size.x - 1 && position.y >= room.Position.y && position.y < room.Position.y + room.Size.y) ||
                    (position.y == room.Position.y && position.x >= room.Position.x && position.x < room.Position.x + room.Size.x) ||
                    (position.y == room.Position.y + room.Size.y - 1 && position.x >= room.Position.x && position.x < room.Position.x + room.Size.x);

                if (isWall)
                {
                    return true;
                }
            }

            return false;
        }

        private void GenerateTiles()
        {
            foreach (var room in rooms)
            {
                GenerateRoomTiles(room);
            }

            foreach (var pos in corridorPositions)
            {
                PlaceCorridorTile(pos);
            }
        }

        private void PlaceCorridorTile(Vector2Int position)
        {
            GameObject prefab = GetCorridorTile();
            if (prefab != null)
            {
                GameObject tile = Instantiate(
                    prefab,
                    new Vector3(position.x, position.y, 0),
                    Quaternion.identity,
                    dungeonParent
                );
                tile.name = $"Corridor_{position.x}_{position.y}";
                generatedTiles.Add(tile);
            }
        }

        private void GenerateRoomTiles(RoomData room)
        {
            for (int x = room.Position.x; x < room.Position.x + room.Size.x; x++)
            {
                for (int y = room.Position.y; y < room.Position.y + room.Size.y; y++)
                {
                    bool isWall =
                        x == room.Position.x ||
                        x == room.Position.x + room.Size.x - 1 ||
                        y == room.Position.y ||
                        y == room.Position.y + room.Size.y - 1;

                    Vector2Int pos = new Vector2Int(x, y);
                    bool isCorridorEntrance = IsCorridorEntrance(pos, room);

                    if (isWall && isCorridorEntrance)
                    {
                        PlaceCorridorTile(pos);
                    }
                    else
                    {
                        GameObject prefab = isWall ? GetWallTile() : GetFloorTile();

                        if (prefab != null)
                        {
                            GameObject tile = Instantiate(
                                prefab,
                                new Vector3(x, y, 0),
                                Quaternion.identity,
                                dungeonParent
                            );
                            tile.name = $"{(isWall ? "Wall" : "Floor")}_{x}_{y}";
                            generatedTiles.Add(tile);
                        }
                    }
                }
            }
        }

        private bool IsCorridorEntrance(Vector2Int position, RoomData room)
        {
            Vector2Int[] adjacentPositions = new Vector2Int[]
            {
                position + Vector2Int.up,
                position + Vector2Int.down,
                position + Vector2Int.left,
                position + Vector2Int.right
            };

            foreach (var adjacent in adjacentPositions)
            {
                if (corridorPositions.Contains(adjacent))
                {
                    return true;
                }
            }

            foreach (var adjacent in adjacentPositions)
            {
                foreach (var otherRoom in rooms)
                {
                    if (otherRoom == room) continue;

                    bool isOtherRoomFloor =
                        adjacent.x > otherRoom.Position.x &&
                        adjacent.x < otherRoom.Position.x + otherRoom.Size.x - 1 &&
                        adjacent.y > otherRoom.Position.y &&
                        adjacent.y < otherRoom.Position.y + otherRoom.Size.y - 1;

                    if (isOtherRoomFloor)
                    {
                        return true;
                    }
                }
            }

            return false;
        }

        public RoomData GetStartRoom()
        {
            return rooms.Find(r => r.Type == RoomType.Start);
        }

        public RoomData GetBossRoom()
        {
            return rooms.Find(r => r.Type == RoomType.Boss);
        }
    }
}
