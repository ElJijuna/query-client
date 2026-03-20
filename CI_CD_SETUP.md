# Query Client - Automated Release & Documentation Setup

Este proyecto está completamente automatizado para:

## 🚀 Publicación Automática en npm

### Cómo funciona:
1. Haces un commit a `main` o `next`
2. El workflow de GitHub Actions se ejecuta automáticamente
3. Genera documentación
4. Ejecuta tests y coverage
5. Publica en npm usando `semantic-release`
6. Despliega documentación en GitHub Pages

### Requisitos en GitHub:
1. **Secrets** que deben estar configurados en Settings → Secrets:
   - `NPM_TOKEN`: Token de npm para publicar (obtener en https://www.npmjs.com/settings/token)
   - `GITHUB_TOKEN`: Se crea automáticamente (no requiere configuración)

2. **GitHub Pages** debe estar habilitado:
   - Settings → Pages
   - Source: Deploy from a branch
   - Branch: `gh-pages` (se crea automáticamente)

### Conventional Commits:
El proyecto usa **semantic-release** que respeta los conventional commits:

```
feat: nueva característica → MINOR version bump
fix: corrección de bug → PATCH version bump
docs: cambios en documentación
style: cambios de formato
refactor: refactorización sin cambios de funcionalidad
perf: mejoras de performance
test: cambios en tests
chore: cambios en build, deps, etc.
BREAKING CHANGE: cambio que rompe compatibilidad → MAJOR version bump
```

**Ejemplo de commit:**
```bash
git commit -m "feat: agregar nueva función de caching

- Implementa cache distribuido
- Soporte para múltiples backends

BREAKING CHANGE: Se cambió la interfaz de QueryConfig"
```

## 📊 Tests y Reportes

### Ejecutar tests localmente:
```bash
# Tests normales
npm test

# Tests con coverage
npm test:coverage

# Generar reporte JSON
npm run test:json

# Tests de performance
npm test:performance
```

### Reporte JSON de tests:
Se genera automáticamente en `test-report.json` con:
- Número de tests pasados/fallidos
- Duración de ejecución
- Detalles de cada test
- Coverage por archivo

## 📖 Documentación

### Generar documentación localmente:
```bash
npm run docs:build
```

Genera documentación en:
- `docs/` - Sitio HTML completo
- `docs/api-docs.json` - Documentación en formato JSON

### Estructura de documentación:
- **API Reference**: Auto-generada desde comentarios JSDoc
- **Guías de uso**: De README.md
- **Ejemplos**: De archivos de ejemplo en el repo

### GitHub Pages:
Se despliega automáticamente en cada release a:
`https://{usuario}.github.io/{repo}/`

## 📦 Scripts disponibles

```json
{
  "build": "Compilar proyecto para distribución",
  "test": "Ejecutar todos los tests",
  "test:coverage": "Tests con reporte de coverage",
  "test:json": "Tests con reporte JSON",
  "test:performance": "Tests de performance",
  "docs": "Generar documentación",
  "docs:build": "Alias para docs",
  "semantic-release": "Publicar versión en npm (automático)"
}
```

## 🔧 Flujo de desarrollo

### 1. Desarrollo local:
```bash
# Crear rama para feature
git checkout -b feature/tu-feature

# Hacer cambios
npm test        # Verificar tests
npm run docs    # Verificar docs

# Commit con conventional commits
git commit -m "feat: descripción"

# Push a GitHub
git push origin feature/tu-feature
```

### 2. Pull Request:
- Se ejecuta workflow de Quality Check
- Genera reporte de coverage
- Valida tests
- Comenta resultados en el PR

### 3. Merge a main:
- Se ejecuta Release workflow
- Publica en npm
- Despliega documentación
- Crea release en GitHub

## 📋 Archivos de configuración

### `.github/workflows/release.yml`
Ejecuta en cada push a main/next:
- Build del proyecto
- Tests con coverage
- Generación de documentación
- Deploy a GitHub Pages
- Publicación a npm

### `.github/workflows/quality.yml`
Ejecuta en cada PR:
- Tests y coverage
- Comentarios con resultados
- Validación de calidad

### `release.config.cjs`
Configuración de semantic-release:
- Análisis de commits
- Generación de changelog
- Versionamiento automático
- Git commits de release

### `typedoc.json`
Configuración de documentación:
- Entry point: `src/index.ts`
- Salida: `docs/`
- Genera JSON API en `docs/api-docs.json`

### `jest.config.cjs`
Configuración de tests:
- Coverage reporters: clover, json, lcov, text
- Thresholds: 80% coverage
- Reporters: default + junit.xml

## 🐛 Troubleshooting

### Los tests no se ejecutan en el workflow
- Verificar que `NPM_TOKEN` esté configurado correctamente
- Revisar logs del workflow en GitHub Actions

### Documentación no se despliega
- Verificar que GitHub Pages esté habilitado
- Revisar permisos del workflow (necesita `pages: write`)
- Revisar la rama `gh-pages` existe

### npm publish falla
- Verificar `NPM_TOKEN` es válido y tiene permisos de escritura
- Verificar que `publishConfig.access` sea "public" en package.json

### Changelog no se genera
- Usar conventional commits (feat:, fix:, etc.)
- No hacer merge con "--no-ff" flags

## 📝 Monitoreo

### Verificar status de workflows:
1. Ve a GitHub → Actions
2. Selecciona el workflow
3. Vé los detalles de cada run

### Ver reportes de tests:
```bash
# JSON report
cat test-report.json | jq '.numPassedTests'

# Coverage
cat coverage/lcov-report/index.html  # Abre en navegador
```

### Verificar releases:
1. GitHub → Releases
2. npm → package page
3. GitHub Pages → Documentación

## 🎓 Recursos

- [Semantic Release Docs](https://semantic-release.gitbook.io)
- [Conventional Commits](https://www.conventionalcommits.org)
- [TypeDoc](https://typedoc.org)
- [GitHub Actions](https://docs.github.com/en/actions)
