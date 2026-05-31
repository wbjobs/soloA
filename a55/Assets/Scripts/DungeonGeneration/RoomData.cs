using UnityEngine;

namespace DungeonSystem
{
    public enum RoomType
    {
        Start,
        Normal,
        Treasure,
        Enemy,
        Boss,
        Corridor
    }

    [System.Serializable]
    public class RoomData
    {
        public int ID;
        public Vector2Int Position;
        public Vector2Int Size;
        public Vector2Int Center => new Vector2Int(
            Position.x + Size.x / 2,
            Position.y + Size.y / 2
        );
        public RoomType Type;
        public bool IsConnected;
        public RoomData ConnectedTo;

        public RoomData(int id, Vector2Int position, Vector2Int size, RoomType type = RoomType.Normal)
        {
            ID = id;
            Position = position;
            Size = size;
            Type = type;
            IsConnected = false;
            ConnectedTo = null;
        }

        public bool Overlaps(RoomData other)
        {
            return
                Position.x < other.Position.x + other.Size.x &&
                Position.x + Size.x > other.Position.x &&
                Position.y < other.Position.y + other.Size.y &&
                Position.y + Size.y > other.Position.y;
        }
    }
}
