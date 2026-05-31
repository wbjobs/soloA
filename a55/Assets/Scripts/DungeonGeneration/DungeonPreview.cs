using UnityEngine;

#if UNITY_EDITOR
using UnityEditor;
#endif

namespace DungeonSystem
{
    public class DungeonPreview : MonoBehaviour
    {
        [SerializeField] private DungeonGenerator dungeonGenerator;
        [SerializeField] private bool showRoomOutlines = true;
        [SerializeField] private bool showRoomCenters = true;
        [SerializeField] private Color startRoomColor = Color.green;
        [SerializeField] private Color normalRoomColor = Color.blue;
        [SerializeField] private Color treasureRoomColor = Color.yellow;
        [SerializeField] private Color enemyRoomColor = Color.red;
        [SerializeField] private Color bossRoomColor = Color.magenta;

        private void OnDrawGizmos()
        {
            if (dungeonGenerator == null || dungeonGenerator.Rooms == null) return;

            foreach (var room in dungeonGenerator.Rooms)
            {
                DrawRoomGizmos(room);
            }
        }

        private void DrawRoomGizmos(RoomData room)
        {
            Color roomColor = GetRoomColor(room.Type);

            if (showRoomOutlines)
            {
                Gizmos.color = roomColor;
                Gizmos.DrawWireCube(
                    new Vector3(room.Center.x, room.Center.y, 0),
                    new Vector3(room.Size.x, room.Size.y, 0)
                );
            }

            if (showRoomCenters)
            {
                Gizmos.color = roomColor * 0.5f;
                Gizmos.DrawSphere(new Vector3(room.Center.x, room.Center.y, 0), 0.5f);
            }
        }

        private Color GetRoomColor(RoomType type)
        {
            switch (type)
            {
                case RoomType.Start:
                    return startRoomColor;
                case RoomType.Normal:
                    return normalRoomColor;
                case RoomType.Treasure:
                    return treasureRoomColor;
                case RoomType.Enemy:
                    return enemyRoomColor;
                case RoomType.Boss:
                    return bossRoomColor;
                default:
                    return Color.white;
            }
        }
    }

#if UNITY_EDITOR
    [CustomEditor(typeof(DungeonGenerator))]
    public class DungeonGeneratorEditor : Editor
    {
        public override void OnInspectorGUI()
        {
            base.OnInspectorGUI();

            DungeonGenerator generator = (DungeonGenerator)target;

            GUILayout.Space(10);

            if (GUILayout.Button("Generate Dungeon (Editor)"))
            {
                generator.GenerateDungeon();
            }

            if (GUILayout.Button("Clear Dungeon"))
            {
                ClearDungeon(generator);
            }
        }

        private void ClearDungeon(DungeonGenerator generator)
        {
            GameObject dungeon = GameObject.Find("Dungeon");
            if (dungeon != null)
            {
                DestroyImmediate(dungeon);
            }
        }
    }
#endif
}
