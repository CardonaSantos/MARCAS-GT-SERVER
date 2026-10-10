/**
 * MARCAS GT | Tracking UI demo seed (PostgreSQL LOCAL únicamente)
 * Uso desde la raíz de MARCAS-GT-SERVER:
 *   npx ts-node --transpile-only scripts/seed-tracking-demo.ts --preview
 *   npx ts-node --transpile-only scripts/seed-tracking-demo.ts --apply
 *   npx ts-node --transpile-only scripts/seed-tracking-demo.ts --cleanup
 *
 * Crea jornadas y puntos GPS ficticios del usuario ADMIN #1 cerca de Jacaltenango.
 * Nunca modifica jornadas ni sesiones existentes y no usa producción.
 * Los recorridos son PLAUSIBLES, no rutas calculadas sobre la red vial.
 */
import 'dotenv/config';
import {
  EstadoSesionTracking,
  PrismaClient,
  type Prisma,
} from '@prisma/client';

const USER_ID = 37;
const TAG = 'MARCAS_TRACKING_UI_DEMO_V1';
const ZONE = 'America/Guatemala';
const DAY_MS = 86_400_000;
const GT_UTC_OFFSET_HOURS = 6; // Guatemala no observa horario de verano.
const prisma = new PrismaClient();

type Mode = '--preview' | '--apply' | '--cleanup';
type Coord = readonly [number, number];
type Point = {
  latitud: number;
  longitud: number;
  precisionM: number;
  velocidadMps: number;
  bateriaPct: number;
  capturadoEn: Date;
};

type SessionPlan = {
  estado: EstadoSesionTracking;
  start: Date;
  finish: Date | null;
  points: Point[];
  routeName: string;
};
type DayPlan = {
  fecha: Date;
  entrada: Date;
  salida: Date | null;
  sessions: SessionPlan[];
};

// Coordenadas de una zona urbana alrededor de Jacaltenango, Huehuetenango.
// Son anclas geométricas ficticias, NO trazos vialmente certificados.
const ROUTES: ReadonlyArray<{ name: string; path: readonly Coord[] }> = [
  {
    name: 'Circuito centro / este',
    path: [
      [15.66718, -91.71343],
      [15.66775, -91.71294],
      [15.66866, -91.71201],
      [15.66955, -91.71114],
      [15.67042, -91.70995],
      [15.67018, -91.70872],
      [15.6693, -91.70817],
      [15.66832, -91.70883],
      [15.6672, -91.71001],
      [15.66624, -91.71107],
      [15.66662, -91.71276],
      [15.66718, -91.71343],
    ],
  },
  {
    name: 'Circuito centro / oeste',
    path: [
      [15.66718, -91.71343],
      [15.66768, -91.71479],
      [15.6684, -91.71601],
      [15.66965, -91.71692],
      [15.67063, -91.71734],
      [15.6713, -91.71802],
      [15.6706, -91.71851],
      [15.66953, -91.71775],
      [15.66858, -91.71659],
      [15.66697, -91.7149],
      [15.66649, -91.71393],
      [15.66718, -91.71343],
    ],
  },
  {
    name: 'Circuito centro / sur',
    path: [
      [15.66718, -91.71343],
      [15.66643, -91.71236],
      [15.66555, -91.71175],
      [15.66449, -91.71106],
      [15.66336, -91.71169],
      [15.66268, -91.7131],
      [15.66286, -91.71488],
      [15.66387, -91.71551],
      [15.6651, -91.71509],
      [15.66648, -91.71413],
      [15.66718, -91.71343],
    ],
  },
];

function requireLocalDatabase(): void {
  if (
    process.env.NODE_ENV?.toLowerCase() === 'production' ||
    process.env.RAILWAY_ENVIRONMENT
  ) {
    throw new Error(
      'Bloqueado: no se ejecuta en NODE_ENV=production ni dentro de Railway.',
    );
  }
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw)
    throw new Error(
      'DATABASE_URL no está configurada. Ejecuta desde la raíz del backend con .env local.',
    );
  const url = new URL(raw.replace(/^["']|["']$/g, ''));
  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]', '::1'].includes(
      url.hostname.toLowerCase(),
    )
  ) {
    throw new Error(
      'Seguridad: solo se permite PostgreSQL en localhost/127.0.0.1. No se permiten BD remotas.',
    );
  }
  console.log(
    `BD local autorizada: ${url.hostname}:${url.port || '5432'} / ${decodeURIComponent(url.pathname.slice(1))}`,
  );
}

function businessDate(instant: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (part: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((value) => value.type === part)?.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
}

function gtDateTime(fecha: Date, hour: number, minute: number): Date {
  return new Date(
    fecha.getTime() +
      (hour + GT_UTC_OFFSET_HOURS) * 3_600_000 +
      minute * 60_000,
  );
}

function isoDay(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}
function rounded(number: number, places = 7): number {
  return Number(number.toFixed(places));
}

function metersBetween(a: Coord, b: Coord): number {
  const radians = (v: number) => (v * Math.PI) / 180;
  const dLat = radians(b[0] - a[0]);
  const dLng = radians(b[1] - a[1]);
  const t =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(t), Math.sqrt(1 - t));
}

function buildPoints(
  anchors: readonly Coord[],
  start: Date,
  end: Date,
  count: number,
  seed: number,
): Point[] {
  if (count < 2 || end <= start)
    throw new Error('Intervalo de simulación inválido.');
  const points: Point[] = [];
  let previous: Coord | null = null;
  for (let i = 0; i < count; i++) {
    const ratio = i / (count - 1);
    const leg = ratio * (anchors.length - 1);
    const a = anchors[Math.floor(leg)];
    const b = anchors[Math.min(Math.floor(leg) + 1, anchors.length - 1)];
    const portion = leg - Math.floor(leg);
    const jitter = i === 0 || i === count - 1 ? 0 : 0.000015; // aprox. 1-2 metros.
    const latitud = rounded(
      a[0] + (b[0] - a[0]) * portion + Math.sin(i * 1.71 + seed) * jitter,
    );
    const longitud = rounded(
      a[1] + (b[1] - a[1]) * portion + Math.cos(i * 1.37 + seed) * jitter,
    );
    const capturadoEn = new Date(
      start.getTime() + Math.round((end.getTime() - start.getTime()) * ratio),
    );
    const secondsPerStep =
      (end.getTime() - start.getTime()) / 1000 / (count - 1);
    const velocity = previous
      ? metersBetween(previous, [latitud, longitud]) / secondsPerStep
      : 0;
    points.push({
      latitud,
      longitud,
      precisionM: rounded(5 + ((i * 7 + seed * 3) % 14), 2),
      velocidadMps: rounded(Math.min(velocity, 13), 2),
      bateriaPct: Math.max(22, 96 - Math.floor(i / 3) - seed * 2),
      capturadoEn,
    });
    previous = [latitud, longitud];
  }
  return points;
}

function makeHistoricalDay(date: Date, index: number): DayPlan {
  const firstStart = gtDateTime(date, 8, 35 + (index % 3) * 5);
  const firstEnd = gtDateTime(date, 11, 10 + (index % 3) * 10);
  const secondStart = gtDateTime(date, 12, 15 + (index % 2) * 10);
  const secondEnd = gtDateTime(date, 16, 5 + (index % 2) * 10);
  const firstRoute = ROUTES[index % ROUTES.length];
  const secondRoute = ROUTES[(index + 1) % ROUTES.length];
  return {
    fecha: date,
    entrada: firstStart,
    salida: secondEnd,
    sessions: [
      {
        estado: EstadoSesionTracking.FINALIZADA,
        start: firstStart,
        finish: firstEnd,
        routeName: firstRoute.name,
        points: buildPoints(
          firstRoute.path,
          firstStart,
          new Date(firstEnd.getTime() - 90_000),
          57,
          index + 1,
        ),
      },
      {
        estado:
          index === 1
            ? EstadoSesionTracking.EXPIRADA
            : EstadoSesionTracking.FINALIZADA,
        start: secondStart,
        finish: secondEnd,
        routeName: secondRoute.name,
        // Para EXPIRADA, el fin coincide con el último heartbeat registrado.
        points: buildPoints(
          secondRoute.path,
          secondStart,
          index === 1 ? secondEnd : new Date(secondEnd.getTime() - 90_000),
          70,
          index + 7,
        ),
      },
    ],
  };
}

function makeLiveDay(date: Date, now: Date): DayPlan {
  const route = ROUTES[0];
  const start = new Date(now.getTime() - 58 * 60_000);
  const lastPoint = new Date(now.getTime() - 60_000);
  return {
    fecha: date,
    entrada: start,
    salida: null,
    sessions: [
      {
        estado: EstadoSesionTracking.ACTIVA,
        start,
        finish: null,
        routeName: route.name,
        points: buildPoints(route.path.slice(0, 9), start, lastPoint, 35, 16),
      },
    ],
  };
}

async function findPlan(
  now: Date,
): Promise<{ days: DayPlan[]; reasonNoLive: string | null }> {
  const today = businessDate(now);
  const candidates: Date[] = [];
  for (let offset = 1; offset <= 35; offset++) {
    const day = new Date(today.getTime() - offset * DAY_MS);
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) candidates.push(day);
  }
  const reserved = await prisma.asistencia.findMany({
    where: { usuarioId: USER_ID, fecha: { in: [today, ...candidates] } },
    select: { fecha: true },
  });
  const busy = new Set(reserved.map((attendance) => isoDay(attendance.fecha)));
  const available = candidates
    .filter((day) => !busy.has(isoDay(day)))
    .slice(0, 3)
    .reverse();
  if (available.length < 3)
    throw new Error(
      'No hay tres fechas libres en los últimos 35 días. No se modificará información existente.',
    );
  const days = available.map((day, i) => makeHistoricalDay(day, i));
  let reasonNoLive: string | null = null;
  const existingActive = await prisma.sesionTrackingUsuario.findFirst({
    where: { usuarioId: USER_ID, estado: EstadoSesionTracking.ACTIVA },
    select: { id: true },
  });
  const currentSnapshot = await prisma.ubicacionUsuarioActual.findUnique({
    where: { usuarioId: USER_ID },
    select: { id: true },
  });
  if (busy.has(isoDay(today)))
    reasonNoLive = 'Ya existe jornada del usuario #1 hoy.';
  else if (existingActive)
    reasonNoLive = `Ya existe sesión activa #${existingActive.id}.`;
  else if (currentSnapshot)
    reasonNoLive =
      'Ya existe ubicación actual del usuario #1 y no se sobrescribirá.';
  else if (
    businessDate(new Date(now.getTime() - 58 * 60_000)).getTime() !==
    today.getTime()
  ) {
    reasonNoLive =
      'La hora es demasiado cercana a medianoche para simular 58 min de jornada hoy.';
  }
  if (!reasonNoLive) days.push(makeLiveDay(today, now));
  return { days, reasonNoLive };
}

async function cleanup(): Promise<void> {
  const result = await prisma.$transaction(
    async (tx) => {
      const demo = await tx.sesionTrackingUsuario.findMany({
        where: { usuarioId: USER_ID, dispositivoId: TAG },
        select: {
          id: true,
          asistenciaId: true,
          _count: { select: { ubicaciones: true } },
        },
      });
      const sessions = demo.map((x) => x.id);
      const attendances = [
        ...new Set(
          demo
            .map((x) => x.asistenciaId)
            .filter((x): x is number => x !== null),
        ),
      ];
      if (!sessions.length) return { sessions: 0, points: 0, attendances: 0 };
      await tx.ubicacionUsuarioActual.deleteMany({
        where: { usuarioId: USER_ID, sesionId: { in: sessions } },
      });
      await tx.sesionTrackingUsuario.deleteMany({
        where: { id: { in: sessions }, usuarioId: USER_ID, dispositivoId: TAG },
      });
      const removed = await tx.asistencia.deleteMany({
        where: {
          id: { in: attendances },
          usuarioId: USER_ID,
          sesionesTracking: { none: {} },
        },
      });
      return {
        sessions: demo.length,
        points: demo.reduce((sum, x) => sum + x._count.ubicaciones, 0),
        attendances: removed.count,
      };
    },
    { timeout: 30_000 },
  );
  console.log('Eliminados registros EXCLUSIVAMENTE de demo:', result);
}

async function apply(days: DayPlan[]): Promise<void> {
  const summary = await prisma.$transaction(
    async (tx) => {
      // Preflight en la misma transacción. Restricciones UNIQUE del servidor siguen protegiendo carreras.
      for (const day of days) {
        const collision = await tx.asistencia.findUnique({
          where: { usuarioId_fecha: { usuarioId: USER_ID, fecha: day.fecha } },
          select: { id: true },
        });
        if (collision)
          throw new Error(
            `La jornada ${isoDay(day.fecha)} ya existe (#${collision.id}); no se sobrescribe.`,
          );
      }
      const existingDemo = await tx.sesionTrackingUsuario.count({
        where: { usuarioId: USER_ID, dispositivoId: TAG },
      });
      if (existingDemo)
        throw new Error(
          'El demo ya está insertado. Ejecuta --cleanup antes de regenerarlo.',
        );
      const hasLive = days.some((day) =>
        day.sessions.some(
          (session) => session.estado === EstadoSesionTracking.ACTIVA,
        ),
      );
      if (hasLive) {
        if (
          await tx.sesionTrackingUsuario.count({
            where: { usuarioId: USER_ID, estado: EstadoSesionTracking.ACTIVA },
          })
        ) {
          throw new Error('Se ha iniciado otra sesión activa. No se modifica.');
        }
        if (
          await tx.ubicacionUsuarioActual.findUnique({
            where: { usuarioId: USER_ID },
          })
        ) {
          throw new Error(
            'Otra operación creó la ubicación actual. No se modifica.',
          );
        }
      }
      let createdSessions = 0;
      let createdPoints = 0;
      for (const day of days) {
        const attendance = await tx.asistencia.create({
          data: {
            usuarioId: USER_ID,
            fecha: day.fecha,
            entrada: day.entrada,
            salida: day.salida,
          },
        });
        for (const [index, session] of day.sessions.entries()) {
          const heartbeat =
            session.points[session.points.length - 1].capturadoEn;
          const isExpired = session.estado === EstadoSesionTracking.EXPIRADA;
          const recordedFinish = isExpired ? heartbeat : session.finish;
          const saved = await tx.sesionTrackingUsuario.create({
            data: {
              usuarioId: USER_ID,
              asistenciaId: attendance.id,
              estado: session.estado,
              iniciadaEn: session.start,
              finalizadaEn: recordedFinish,
              ultimoHeartbeatEn: heartbeat,
              motivoCierre:
                session.estado === EstadoSesionTracking.ACTIVA
                  ? null
                  : isExpired
                    ? 'HEARTBEAT_EXPIRADO'
                    : 'MANUAL',
              dispositivoId: TAG,
              plataforma: 'SIMULADOR_TEST',
            },
          });
          const data: Prisma.UbicacionUsuarioHistorialCreateManyInput[] =
            session.points.map((point, pointIndex) => ({
              sesionId: saved.id,
              claveIdempotencia: `${TAG}:${isoDay(day.fecha)}:${index}:${pointIndex}`,
              latitud: point.latitud,
              longitud: point.longitud,
              precisionM: point.precisionM,
              velocidadMps: point.velocidadMps,
              bateriaPct: point.bateriaPct,
              capturadoEn: point.capturadoEn,
              persistidoEn: point.capturadoEn, // Simulación de recepción cercana al momento real.
            }));
          await tx.ubicacionUsuarioHistorial.createMany({ data });
          createdSessions++;
          createdPoints += data.length;
          if (session.estado === EstadoSesionTracking.ACTIVA) {
            const latest = session.points[session.points.length - 1];
            await tx.ubicacionUsuarioActual.create({
              data: {
                usuarioId: USER_ID,
                sesionId: saved.id,
                latitud: latest.latitud,
                longitud: latest.longitud,
                precisionM: latest.precisionM,
                velocidadMps: latest.velocidadMps,
                bateriaPct: latest.bateriaPct,
                capturadoEn: latest.capturadoEn,
                persistidoEn: latest.capturadoEn,
              },
            });
          }
        }
      }
      return {
        jornadas: days.length,
        sesiones: createdSessions,
        puntos: createdPoints,
      };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
  console.log('Seed aplicado:', summary);
}

async function main() {
  const arg = process.argv.slice(2);
  const mode: Mode = (arg[0] ?? '--preview') as Mode;
  if (!['--preview', '--apply', '--cleanup'].includes(mode) || arg.length > 1) {
    throw new Error('Modo inválido. Utiliza --preview, --apply o --cleanup.');
  }
  requireLocalDatabase();
  await prisma.$connect();
  const user = await prisma.usuario.findUnique({
    where: { id: USER_ID },
    select: { id: true, nombre: true, rol: true, activo: true },
  });
  if (!user || user.rol !== 'ADMIN' || !user.activo) {
    throw new Error(
      'Se requiere que el usuario #1 exista, tenga rol ADMIN y esté activo.',
    );
  }
  console.log(`Usuario destino: #${user.id} ${user.nombre} (${user.rol})`);
  if (mode === '--cleanup') return cleanup();
  const existing = await prisma.sesionTrackingUsuario.count({
    where: { usuarioId: USER_ID, dispositivoId: TAG },
  });
  if (existing)
    throw new Error(
      `Ya existen ${existing} sesiones demo. Usa --cleanup y luego --apply.`,
    );
  const { days, reasonNoLive } = await findPlan(new Date());
  for (const day of days) {
    const count = day.sessions.reduce(
      (sum, session) => sum + session.points.length,
      0,
    );
    console.log(
      `${isoDay(day.fecha)} | ${day.sessions.length} sesiones | ${count} puntos | ${day.sessions.map((s) => s.estado).join(', ')}`,
    );
  }
  if (reasonNoLive) console.log('SIN sesión en vivo:', reasonNoLive);
  else console.log('CON sesión ACTIVA reciente para el mapa en vivo.');
  if (mode === '--preview') {
    console.log(
      'Vista previa terminada. NO se insertó ningún registro. Usa --apply para confirmar.',
    );
    return;
  }
  await apply(days);
  console.log(
    'Actualiza el frontend: /marcas-gt/tracking y /marcas-gt/tracking/historial',
  );
  console.log(
    'IMPORTANTE: las escrituras Prisma directas NO emiten eventos Socket.IO. La UI las verá al refrescar HTTP.',
  );
}

main()
  .catch((error: unknown) => {
    console.error('ERROR:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
