# ⚡️ QueryClient

[![npm version](https://img.shields.io/npm/v/client-query.svg)](https://www.npmjs.com/package/client-query)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)
![GitHub issues](https://img.shields.io/github/issues/ElJijuna/client-query.svg)
![GitHub stars](https://img.shields.io/github/stars/ElJijuna/client-query.svg)
![GitHub forks](https://img.shields.io/github/forks/ElJijuna/client-query.svg)

Una ligera y poderosa biblioteca en TypeScript para la gestión de datos asíncronos y el almacenamiento en caché. `QueryClient` simplifica la lógica de manejo de peticiones, reintentos, cacheo y recolección de basura, permitiendo a los desarrolladores centrarse en la lógica de negocio.

---

## 📋 Tabla de Contenidos

1.  [✨ Características](#-características)
2.  [📦 Instalación](#-instalación)
3.  [🚀 Uso](#-uso)
4.  [⚙️ Configuración](#-configuración)
5.  [🧪 Tests](#-tests)
6.  [🤝 Contribución](#-contribución)
7.  [📜 Licencia](#-licencia)

---

## ✨ Características

*   **Patrón Singleton:** Un único punto de acceso global a la instancia del cliente.
*   **Gestión de Caché:** Almacena los resultados de las peticiones para evitar llamadas repetidas.
*   **Reintentos Automáticos:** Configura el número de reintentos en caso de que una petición falle.
*   **Backoff Exponencial:** Aumenta el tiempo de espera entre reintentos para no saturar el servidor.
*   **Tiempo de Caducidad (`staleTime`):** Define cuándo los datos en caché deben considerarse caducados y ser refrescados.
*   **Recolección de Basura (`gcTime`):** Elimina automáticamente las queries inactivas del caché para optimizar la memoria.
*   **Invalidación:** Invalida manualmente los datos en caché para forzar una nueva petición.
*   **Escritura en TypeScript:** Tipado estricto para un desarrollo más seguro y predecible.

---

## 📦 Instalación

Instala el paquete usando npm o yarn:

```bash
npm install query-client
# o
yarn add query-client
```

---

## 🚀 Uso

```typescript
import { QueryClient } from 'query-client';

// Obtener la instancia singleton
const client = QueryClient.getInstance();

// Configurar el cliente (opcional)
client.setConfig({
  retry: 2,
  staleTime: 1000 * 60, // 1 minuto
});

const myQueryFn = async () => {
  const response = await fetch('https://api.example.com/data');
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  return response.json();
};

async function fetchData() {
  try {
    // La primera vez, hará la petición. La segunda, usará el caché.
    const response = await client.fetchQuery({
      queryKey: ['my-data'],
      queryFn: myQueryFn,
    });
    console.log('Datos obtenidos:', response.data.data);
  } catch (error) {
    console.error('Error al obtener los datos:', error);
  }
}
```

### Invalidar y refrescar:

```typescript
// Forzar una nueva petición invalidando la caché
client.invalidateQueryData({ queryKey: ['my-data'] });

// La próxima llamada a fetchQuery hará una nueva petición
client.fetchQuery({
  queryKey: ['my-data'],
  queryFn: myQueryFn,
});

```

## 🤝 Contribución
¡Las contribuciones son bienvenidas! Si encuentras un bug o tienes una sugerencia, por favor, abre un issue o un pull request.

---

### 📜 Licencia
Este proyecto está bajo la Licencia MIT. Para más detalles, consulta el archivo LICENSE.

---
### 👨‍💻 Autor
Ivan - @ElJijuna