# Landing editorial con textura granulada

## Dirección aprobada

El usuario aprobó la dirección editorial texturizada: tipografía Cooper, neutros actuales, grano localizado y composiciones distintas por sección. El primer pase abarca hero, Automatizaciones, Enterprise y cierre.

## Objetivo

Dar identidad a Senka y romper la repetición de título, ventana grande y detalles. La textura debe sentirse como material iluminado, con una presencia perceptible pero secundaria al contenido.

## Tratamiento por sección

### Hero

- Integrar grano fino en el fondo iluminado, con mayor presencia alrededor del haz y caída suave hacia los bordes y la demo.
- Reducir protagonismo de la cuadrícula y el brillo alrededor de las letras para que Cooper sea el foco.
- Mantener título, acciones y demo legibles en escritorio y móvil.

### Automatizaciones

- Convertir mensaje → decisión → respuesta en el hilo visual de la sección.
- Presentar tres etapas numeradas y conectadas que expliquen el flujo existente: recibir una consulta, consultar conocimiento y decidir, responder o pasar a una persona.
- Componer esa explicación junto al ejemplo del flujo, reutilizando su canvas. La inspección de implementación confirmó que la demo es estática e inerte; se conserva ese comportamiento y se presenta como ejemplo, no como editor operativo.
- El marco del ejemplo usa una barra de navegador mínima: solo los tres puntos rojo, amarillo y verde, según la revisión visual del usuario.
- En pantallas estrechas, apilar explicación y demo en orden de lectura, sin reducir texto hasta volverlo ilegible.
- Conservar acceso a conectores y detalles de automatización.

### Enterprise / Autoalojado

- Crear una superficie de grafito mate en oscuro y su equivalente claro de baja intensidad.
- Sustituir las dos filas en movimiento por una composición fija: infraestructura propia como elemento central y garantías agrupadas alrededor o debajo según ancho disponible.
- Reutilizar contenido y escenas existentes para base de datos, sandbox, webhooks, claves, conexiones permitidas y trazas.
- Mostrar las seis garantías una vez, con texto seleccionable y orden de lectura estable.

### Cierre

- Conservar el cierre original con las órbitas, las estrellas y los iconos de Meta, WhatsApp e Instagram. El usuario prefirió esa composición al símbolo de Senka ampliado al revisar la implementación.
- Añadir textura fina al fondo del cierre original.
- Mantener un cierre compacto en móvil.

## Implementación visual

- Textura estática y determinista mediante un recurso SVG de ruido reutilizable y capas CSS decorativas; sin bucles de animación para generar grano.
- Usar intensidad por tema y zona. Punto de partida: 3–5% en oscuro y 1–2% en claro, sujeto a comprobación visual del resultado compuesto.
- Separar textura del contenido mediante capas locales; `pointer-events: none` y `aria-hidden` para elementos decorativos.
- Acotar estilos editoriales a la landing, incluidas sus instancias de componentes compartidos.
- Conservar los tokens actuales de color, tipografía, controles y contraste.
- Incorporar cualquier texto nuevo en los diccionarios español e inglés.
- Respetar movimiento reducido en los elementos reutilizados.

## Alcance del primer pase

Hero, Automatizaciones, Enterprise y cierre constituyen la entrega. La reorganización de Capacidades queda para un pase posterior; no es necesaria para verificar esta dirección.

## Verificación

- Ejecutar TypeScript y ESLint sobre los archivos afectados; distinguir errores previos si aparecen.
- Revisar en navegador a 390, 768 y 1440 px, en temas claro y oscuro.
- Capturar cada sección después de que sus elementos hayan entrado en vista; la landing utiliza reveals que no se activan todos al saltar directamente al inicio de una sección.
- Comprobar ausencia de desbordamiento horizontal, controles cubiertos, bordes de textura abruptos y pérdida de legibilidad.
- Comprobar acciones principales, anclas y detalles expandibles de Automatizaciones; el canvas de ejemplo debe seguir fuera del orden de tabulación.
- Verificar que el grano no añade JavaScript de animación ni depende de WebGL.
