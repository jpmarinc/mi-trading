# Product Workflow Rules — Trading Dashboard

## Contexto del proyecto
Dashboard operativo de trading personal y control financiero.
Stack: React (Vite), Node.js proxy local y todo lo que hemos trabajado hasta ahora. Si tenemos que ampliar el stack avisame y lo definimos en conjunto y lo anoto acá. 
PostgreSQL como fuente primaria.
El feedback de cada sesión llega en este archivo, debajo de esta sección.

### Funcionalidades principales
- Registro y seguimiento de operaciones abiertas y cerradas
- Reconciliación de trades históricos (Binance e Hyperliquid)
- Seguimiento de deudas y proyección de pagos
- Reglas de bloqueo para overtrading
- Análisis de performance por ventanas de tiempo
- Calculadora de posición con SL/TP y ejecución en futuros de Binance 
- Integraciones con exchanges y feeds de precios en vivo
- Sistema de alertas por Telegram
- Copy de operaciones para Discord de Chroma (#trading)

El objetivo es un sistema operativo de trading, BD con el historico, tracking de deudas con un plan de pago y no solo una UI.

---

## Workflow

### I. Plan antes de código
- Cualquier tarea con más de 3 pasos: escribir plan en `todo.md` 
  antes de tocar código.
- Si algo falla o se desvía, detener e informar antes de continuar.
- Validar el plan antes de implementar.

### II. Verificación antes de cerrar tareas
- Nunca marcar completa sin validar que `npm run build` pasa sin errores.
- Confirmar que los cálculos financieros y de trading sean correctos.
- No romper funcionalidades existentes.

### III. Corrección de bugs
- Investigar causa raíz → reproducir → corregir → validar.
- No pedir instrucciones paso a paso.
- Registrar el patrón en `claude.md` (sección "Patrones de error").

### IV. Elegancia técnica
- Sin fixes temporales.
- Sin lógica hardcodeada en cálculos financieros.
- Cambios simples con impacto directo.

### V. Resumen de sesión (instrucción permanente)
Al finalizar cada sesión:
1. Marcar ítems completados con ✅ en este archivo.
2. Agregar entrada en `changelog.md` con los cambios.
3. Si cambió funcionalidad, actualizar `DOCS.md`.
4. Enviar resumen en el chat.

---

## Task Management
1. Plan en `todo.md` con checklist antes de implementar.
2. Marcar progreso incremental.
3. Documentar resultados en `DOCS.md`.
4. Registrar lecciones y errores nuevos en `claude.md`.

---

# Iteration Feedback — Trading Dashboard

Lista activa de mejoras detectadas durante testing funcional:

---

### 1. Al ingresar ordenes desde el dashboard, el TP o SL no se mandan a Binance 

* Seguimos con el problema de las SL, me devuelve el siguiente error para la SL y TP 

![alt text](image-46.png)

{ok: false,…}
msg
: 
"Binance -4120: Order type not supported for this endpoint. Please use the Algo Order API endpoints instead."
ok
: 
false
![alt text](image-49.png)

---

### 2. ELimina la funcionalidad de "Migrar schema (BD existente)" y "migrar historial a la BD"

* Ya validamos que funciona, es momento de eliminarlo.

---

### 3. Modificar lógica de "Call" al importar desde Binance

* Si bien la reconciliación de BN funciona perfectmente, el "call" viene por defecto "Binance" cuando en realidad ese campo debería ser "S/E" de sin especificar. La cuenta debe ser "Binance" tal cual como esta.

---

### 4. Conectar historial de posiciones con sus respectivos PnL con la tab "Performance"

* Dado que ahora puedo traer el PnL historico de mis posiciones en Binance, debes calcular cuanto fue mi performance (en la tab de "Performance") con el PnL que da en la BD historico. Y eso respetando las R que tengo configuradas segun cada fuente (Binance para la gran mayoria)

![alt text](image-48.png) --> Podemos ver que a pesar de tener la BD mucho mas poblada el rendimiento sigue igual.

* Ojo con que la data importada tiene fecha por ende se debe poder filtrar por rend en los ultimos 7 dias / 30 dias / todo

* Agregar un filtro, al lado del de "Todas las cuentas", que sea de "Call" para ver como me ha ido con las llamadas de ciertos analistas

---

### 5. Corregir PnL cerradas del dashboard

* Al igual que el punto de conectar el PnL dado que la BD esta más poblada, en el dashboard se debe poder ver. Ese número debe ser el historico 


---

### 6. No se estan considerando las fees al momento de importar los trades

* Como podemos ver en la siguiente Imagen no se estan considerando las feed en las importaciones de Binance:

![alt text](image-49.png)

Que podemos hacer para fixear la BD que ya tengo cargada? es importante ya que el PnL puede cambiar de manera importante a través del tiempo.

--



Por otro lado te quiero dejar el backlog del producto cosa que me ayudes a construirlo y hagamos en conjunto un backlog. Mandame una propuesta y lo vamos iterando:

1) Conectar con el grupo de trading de Chroma, que esta en discord, y ser capaz de agregar/cerrar posiciones a través de telegram. Ya me llegan notificaciones push cuando abrimos/SL o TP en telegram y sería ideal que ahora los call en Chroma me llegue un msje preguntando si quiero abrir una posición en Binance y que

#New-trades
![alt text](image-50.png) ---> Cada vez que agregan un nuevo trade al tracker se genera una notificación ahí la cual me llega un mensaje. Si vemos el interior del ultimo mensaje que es un LONG del par COMPUSDT del trade "Silla" vemos lo siguiente:

![alt text](image-51.png) --> Tenemos todo lo necesario para crear una orden limite ya que esta el entry price, SL y TP. (Ojo que el mensaje se puede ir actualizando) ya que a veces crean posiciones market y después agregan el SL y TP.

Por ende cada vez que se haga un trade de ciertos analistas, tener un workflow que automaticamente me agregue el trade por 1R (definido en maintainers) o bien para otros traders que sea por 0.5 R, basicamente poder configurar eso a través de maintainers. Del listado completo yo elegeir con quien entren posiciones si o si, me consulte y cuantas unidades de riesgo anotar


2) Analisis/Proyección de gastos y deudas vs ingresos. Hoy en día no tengo control de mis gastos y mi sueldo se me esta haciendo poco dado los gastos que tengo y porque no llevo control. seria ideal que yo pueda ingresar mis gastos del día con una estructura como la que tenia en su momento con Fintonic (cerro en chile), pero tengo varios analisis mensuales en donde veia mis gastos:
https://docs.google.com/spreadsheets/d/13gp6Uk1vY3ApGzLoj_IQj1i7X7itmnSjmnxiEwQtZ6k/edit?usp=sharing 

Aquí podemos ver que en la hoja "Movimiento full" esta toda la data que cargaba en la aplicación  en donde estan los siguientes campos clave:

Fecha: Fecha en que ocurrió el gasto
Importe: Valor en la moneda específicada. 99% será en CLP
Moneda: Moneda del movimiento, por defecto siempre debe ser CLP
Concepto: Dado que los movimientos se generaban automaticamente en la app, era la descripción que tenian del banco. Se podria borrar u omitir ya que lo que mas me importa es la categoría + nota
Entidad: Entidad en donde se realizo el gasto, aquí por ejemplo sería definir si lo hice en TENPO, Scotiabank o Itau que son los bancos que utilizo
Nombre de producto: Que tarjeta se utilizo
Tipo de producto: Donde se realizo el movimiento si en la cuenta corriente o en una tarjeta
Tipo de movimiento: Ocupaba este tipo de movimiento para ver si se deberia contabilizar el gasto o no, ya que por ejemplo a principio de mes pagaba la tarjeta pero no queria que fuera un 2ble gasto en el mes ya que era el pago de la tarjeta y los movimientos del mes anterior. 
Categoría: CLAVE. 
Nota: Comentarios sobre el gasto. un varchar de 255 max
USD: Valor en USD, monto referencial que se debe poder editar. Sacar con el valor del dolar del día o bien lo que hacia cuando me bajaba todos los movimientos era uqe definia 1 valor para USD y de ahí realizaba la conversión

Ideal que esto lo pueda hacer por la UI del proyecto en localhost o bien poder tambien ingresar gastos a través de telegram. Versión futura seria poder obtener todo automaticamente con un CRON cada 1 hora y que vea mis movimientos en mis respectivos bancos.

3) Dado que voy a comprar una cuenta de breakout seria tambien ideal poder manejar los trades desde el dashboard, por ende ver si nos podemos conectar via API y considerar que hace poco fue adquirido por Kraken

4) Mejorar las funcionalidades con TG: Dado que no puedo estar con mi PC todo el día seria ideal poder manejar mas cosas en TG. Hoy en dia es meramente informativo para las posiciones en Binance (y no sé si funciona en caso que apague el proxy) pero la idea en el futuro es:

* Abrir/cerrar/gestionar posiciones vivas en cualquier fuente (Binance, breakout, etc..) en la cual tenga una API-key con edición de los movimientos. No aplica para quantfury x ejemplo ya que no tenemos API
* Ingresar/editar/pedir resumen del módulo de control de gastos, el cual te describi en el punto 2
* Agregar alertas de precio o bien si se cumplen ciertos indicadores específicos (RSI en el futuro y otros que determinemos)

Dado que para lo anterior significa bastante trabajo me interesa que en conjunto planifiquemos un backlog por etapas y vayamos desarrollando de manera incremental. tambien importante si necesitamos una VM en algun lado me avises y evaluemos el costo de tenerla corriendo constantemente y evaluamos. Basicamente la pregunta es si ya es momento de hacer un upgrade a nuestra infra dada la solicitud que te comento. Importante que evaluemos bien los costos ya que mi flujo de caja es MUY limitado.


