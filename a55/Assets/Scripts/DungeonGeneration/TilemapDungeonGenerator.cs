using UnityEngine;
using UnityEngine.Tilemaps;

namespace DungeonSystem
{
    public class TilemapDungeonGenerator : MonoBehaviour
    {
        [Header("Dungeon Settings")]
        [SerializeField] private Vector2Int dungeonSize = new Vector2Int(100, 100);
        [SerializeField] private int minRoomSize = 6;
        [SerializeField] private int maxRoomSize = 12;
        [SerializeField] private int roomCount = 20;
        [SerializeField] private int corridorWidth = 2;
        [SerializeField] private int separation = 3;

        [Header("Tile References")]
        [SerializeField] private Tilemap floorTilemap;
        [SerializeField] private Tilemap wallTilemap;
        [SerializeField] private TileBase floorTile;
        [SerializeField] private TileBase wallTile;

        [Header("Room Types")]
        [Range(0, 1)]
        [SerializeField] private float treasureRoomChance = 0.15f;
        [Range(0, 1)]
        [SerializeField] private float enemyRoomChance = 0.6f;

        private System.Collections.Generic.List<RoomData> rooms = new System.Collections.Generic.List<RoomData>();
        public System.Collections.Generic.List<RoomData> Rooms => rooms;

        public void GenerateDungeon()
        {
            ClearDungeon();
            GenerateRooms();
            GenerateCorridors();
        }

        private void ClearDungeon()
        {
            if (floorTilemap != null)
                floorTilemap.ClearAllTiles();
            if (wallTilemap != null)
                wallTilemap.ClearAllTiles();

            rooms.Clear();
        }

        private void GenerateRooms()
        {
            for (int i = 0; i < roomCount; i++)
            {
                Vector2Int size = new Vector2Int(
                    Random.Range(minRoomSize, maxRoomSize),
                    Random.Range(minRoomSize, maxRoomSize)
                );

                Vector2Int position = new Vector2Int(
                    Random.Range(-dungeonSize.x / 2, dungeonSize.x / 2 - size.x),
                    Random.Range(-dungeonSize.y / 2, dungeonSize.y / 2 - size.y)
                );

                RoomData newRoom = new RoomData(i, position, size);

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
                    AssignRoomType(newRoom);
                    rooms.Add(newRoom);
                    GenerateRoomTiles(newRoom);
                }
            }
        }

        private void AssignRoomType(RoomData room)
        {
            if (rooms.Count == 0)
            {
                room.Type = RoomType.Start;
            }
            else if (rooms.Count == roomCount - 1)
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

        private void GenerateCorridors()
        {
            for (int i = 1; i < rooms.Count; i++)
            {
                CreateLShapedCorridor(rooms[i - 1].Center, rooms[i].Center);
            }
        }

        private void CreateLShapedCorridor(Vector2Int start, Vector2Int end)
        {
            int minX = Mathf.Min(start.x, end.x);
            int maxX = Mathf.Max(start.x, end.x);
            int minY = Mathf.Min(start.y, end.y);
            int maxY = Mathf.Max(start.y, end.y);

            for (int x = minX; x <= maxX; x++)
            {
                for (int w = 0; w < corridorWidth; w++)
                {
                    PlaceFloorTile(new Vector3Int(x, start.y + w - corridorWidth / 2, 0));
                }
            }

            for (int y = minY; y <= maxY; y++)
            {
                for (int w = 0; w < corridorWidth; w++)
                {
                    PlaceFloorTile(new Vector3Int(end.x + w - corridorWidth / 2, y, 0));
                }
            }
        }

        private void PlaceFloorTile(Vector3Int position)
        {
            if (floorTilemap != null && floorTile != null)
            {
                floorTilemap.SetTile(position, floorTile);
            }
        }

        private void GenerateRoomTiles(RoomData room)
        {
            for (int x = room.Position.x; x < room.Position.x + room.Size.x; x++)
            {
                for (int y = room.Position.y; y < room.Position.y + room.Size.y; y++)
                {
                    Vector3Int pos = new Vector3Int(x, y, 0);
                    bool isWall =
                        x == room.Position.x ||
                        x == room.Position.x + room.Size.x - 1 ||
                        y == room.Position.y ||
                        y == room.Position.y + room.Size.y - 1;

                    if (isWall)
                    {
                        if (wallTilemap != null && wallTile != null)
                            wallTilemap.SetTile(pos, wallTile);
                    }
                    else
                    {
                        if (floorTilemap != null && floorTile != null)
                            floorTilemap.SetTile(pos, floorTile);
                    }
                }
            }
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
