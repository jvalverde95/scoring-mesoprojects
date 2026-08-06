-- ============================================================
-- NEXUS · Esquema de base de datos para Azure SQL Database
-- Ejecuta este script en tu base de datos antes de activar
-- el adaptador azure-sql (DB_PROVIDER=azure-sql).
-- ============================================================

-- Cartera de proyectos (una fila por clave de publicación)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Portfolios')
CREATE TABLE Portfolios (
    [key]      NVARCHAR(100)  NOT NULL PRIMARY KEY,
    data       NVARCHAR(MAX)  NOT NULL,          -- JSON de la cartera
    updatedAt  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);

-- Usuarios importados de Entra ID y su acceso a la app
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
CREATE TABLE Users (
    email      NVARCHAR(255)  NOT NULL PRIMARY KEY,
    name       NVARCHAR(255)  NULL,
    allowed    BIT            NOT NULL DEFAULT 0,   -- ¿tiene acceso a la app?
    role       NVARCHAR(50)   NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
    importedAt DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);

-- El administrador inicial (ajusta si cambia)
IF NOT EXISTS (SELECT * FROM Users WHERE email = 'jvalverde@mesoestetic.com')
INSERT INTO Users (email, name, allowed, role)
VALUES ('jvalverde@mesoestetic.com', 'J. Valverde', 1, 'admin');
