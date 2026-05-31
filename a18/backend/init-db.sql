-- 创建数据库
CREATE DATABASE pipeline_system;

-- 连接到数据库
\c pipeline_system

-- 启用PostGIS扩展
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- 验证PostGIS安装
SELECT PostGIS_Version();

-- 创建表结构（如果使用原始SQL而不是Sequelize sync）

-- 图层表
CREATE TABLE IF NOT EXISTS layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('terrain', 'pipeline', 'node', 'annotation')),
  visible BOOLEAN DEFAULT true,
  style JSONB DEFAULT '{}',
  properties JSONB DEFAULT '{}',
  "order" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 管网节点表
CREATE TABLE IF NOT EXISTS pipeline_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  "nodeType" VARCHAR(50) NOT NULL CHECK ("nodeType" IN ('junction', 'valve', 'pump', 'tank', 'reservoir')),
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  z DOUBLE PRECISION DEFAULT 0,
  elevation DOUBLE PRECISION DEFAULT 0,
  pressure DOUBLE PRECISION DEFAULT 0,
  demand DOUBLE PRECISION DEFAULT 0,
  properties JSONB DEFAULT '{}',
  "layerId" UUID,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  geom geometry(Point, 4326),
  FOREIGN KEY ("layerId") REFERENCES layers(id) ON DELETE SET NULL
);

-- 创建空间索引
CREATE INDEX IF NOT EXISTS idx_pipeline_nodes_geom ON pipeline_nodes USING GIST (geom);

-- 管道表
CREATE TABLE IF NOT EXISTS pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  "startNodeId" UUID NOT NULL,
  "endNodeId" UUID NOT NULL,
  material VARCHAR(100) NOT NULL,
  diameter DOUBLE PRECISION NOT NULL,
  length DOUBLE PRECISION NOT NULL,
  depth DOUBLE PRECISION DEFAULT 0,
  "flowRate" DOUBLE PRECISION DEFAULT 0,
  velocity DOUBLE PRECISION DEFAULT 0,
  roughness DOUBLE PRECISION DEFAULT 0.01,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  properties JSONB DEFAULT '{}',
  "layerId" UUID,
  geometry JSONB,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  geom geometry(LineString, 4326),
  FOREIGN KEY ("startNodeId") REFERENCES pipeline_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY ("endNodeId") REFERENCES pipeline_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY ("layerId") REFERENCES layers(id) ON DELETE SET NULL
);

-- 创建空间索引
CREATE INDEX IF NOT EXISTS idx_pipelines_geom ON pipelines USING GIST (geom);

-- 插入示例图层数据
INSERT INTO layers (id, name, type, visible, style, properties, "order") VALUES
  ('layer_terrain', '地形图层', 'terrain', true, '{"color": "#336633", "opacity": 0.8}', '{"description": "城市基础地形图层"}', 0),
  ('layer_pipelines', '管网图层', 'pipeline', true, '{"color": "#0066ff", "opacity": 0.9, "width": 3}', '{"description": "城市管网管道图层"}', 1),
  ('layer_nodes', '节点图层', 'node', true, '{"size": 8, "opacity": 1, "outlineWidth": 2}', '{"description": "管网节点图层"}', 2),
  ('layer_annotations', '标注图层', 'annotation', true, '{"fontSize": 14, "color": "#ffffff", "outlineColor": "#000000"}', '{"description": "管网标注和信息图层"}', 3)
ON CONFLICT (id) DO NOTHING;

-- 触发更新时间戳的函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 为各表创建更新触发器
DROP TRIGGER IF EXISTS update_layers_updated_at ON layers;
CREATE TRIGGER update_layers_updated_at BEFORE UPDATE ON layers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pipeline_nodes_updated_at ON pipeline_nodes;
CREATE TRIGGER update_pipeline_nodes_updated_at BEFORE UPDATE ON pipeline_nodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pipelines_updated_at ON pipelines;
CREATE TRIGGER update_pipelines_updated_at BEFORE UPDATE ON pipelines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建用于拓扑分析的辅助视图
CREATE OR REPLACE VIEW pipeline_topology AS
SELECT 
  p.id,
  p.name,
  p."startNodeId",
  p."endNodeId",
  p.length,
  p.diameter,
  p.material,
  p.status,
  n1.x AS start_x,
  n1.y AS start_y,
  n1.z AS start_z,
  n2.x AS end_x,
  n2.y AS end_y,
  n2.z AS end_z
FROM pipelines p
JOIN pipeline_nodes n1 ON p."startNodeId" = n1.id
JOIN pipeline_nodes n2 ON p."endNodeId" = n2.id;

-- 分析统计函数
CREATE OR REPLACE FUNCTION get_pipeline_statistics()
RETURNS TABLE (
  total_pipelines BIGINT,
  total_length DOUBLE PRECISION,
  avg_diameter DOUBLE PRECISION,
  by_material JSONB,
  by_status JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM pipelines),
    (SELECT SUM(length) FROM pipelines),
    (SELECT AVG(diameter) FROM pipelines),
    (SELECT jsonb_object_agg(material, count) 
     FROM (SELECT material, COUNT(*) as count FROM pipelines GROUP BY material) m),
    (SELECT jsonb_object_agg(status, count) 
     FROM (SELECT status, COUNT(*) as count FROM pipelines GROUP BY status) s);
END;
$$ LANGUAGE plpgsql;

-- 计算两点之间距离的函数（使用球面距离）
CREATE OR REPLACE FUNCTION calculate_haversine_distance(
  lat1 DOUBLE PRECISION,
  lon1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lon2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
DECLARE
  R DOUBLE PRECISION := 6371000; -- 地球半径，单位米
  dLat DOUBLE PRECISION := RADIANS(lat2 - lat1);
  dLon DOUBLE PRECISION := RADIANS(lon2 - lon1);
  a DOUBLE PRECISION;
  c DOUBLE PRECISION;
BEGIN
  a := SIN(dLat/2) * SIN(dLat/2) +
       COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
       SIN(dLon/2) * SIN(dLon/2);
  c := 2 * ATAN2(SQRT(a), SQRT(1-a));
  RETURN R * c;
END;
$$ LANGUAGE plpgsql;

RAISE NOTICE '数据库初始化完成';
