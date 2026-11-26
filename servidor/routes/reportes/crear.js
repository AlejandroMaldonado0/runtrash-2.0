/**
 * @file Creación de reportes ciudadanos.
 *
 * La ruta valida la petición y traduce errores a HTTP. La decisión de
 * negocio (límite diario y asignación automática) vive en
 * `services/reportes`, dentro de una transacción.
 *
 * La localidad no se acepta desde el cliente: se calcula con las
 * coordenadas GPS para que no se pueda alterar.
 *
 * @module routes/reportes/crear
 */

const express = require('express');
const path = require('node:path');
const reportesService = require('../../services/reportes');
const { esErrorServicio } = require('../../services/errores');
const { requiereCiudadano } = require('../../lib/auth');
const { emitirEvento } = require('../../lib/eventos');
const { notificarUsuarios, idsPorRol } = require('../../lib/notificaciones');
const { enParalelo, enParaleloSeguro } = require('../../lib/concurrencia');
const upload = require('../../lib/upload');
const almacen = require('../../lib/almacen');
const { resolverLocalidad } = require('../../lib/geolocalizacion');

const router = express.Router();

/*
Con memoryStorage la imagen todavía no existe en disco, así que no
hay nada que borrar aquí: solo se escribe cuando la petición es
válida. Si ya se guardó y algo falla después, se llama a
almacen.eliminar() con la clave devuelta.
*/
function eliminarArchivoTemporal(_file) {
    return;
}

router.post('/reportes',
    requiereCiudadano,
    upload.single('imagen'),
    async (req, res) => {

        /*
        Se declara antes del try porque el bloque catch la usa
        para borrar la imagen si algo falla mas adelante. Si se
        declarara dentro, al fallar una validacion early todavia
        no existiria y saltaria un ReferenceError que taparia
        el error real.
        */
        let imagen_url = null;

        try {

            const {
                tipo,
                descripcion,
                ubicacion,
                latitud,
                longitud
            } = req.body;
            const usuarioId = req.usuarioAutenticado.id;

            const tipoNormalizado = String(tipo || '').trim();
            const descripcionNormalizada = String(descripcion || '').trim();
            const ubicacionNormalizada = String(ubicacion || '').trim();

            if (!['Basura', 'Escombro', 'Acumulación de residuos', 'Basura en vía pública', 'Residuos en zona verde', 'Otro'].includes(tipoNormalizado)) {
                eliminarArchivoTemporal(req.file);
                return res.status(400).json({
                    ok: false,
                    mensaje: 'Selecciona Basura o Escombro.'
                });
            }

            if (!descripcionNormalizada) {
                eliminarArchivoTemporal(req.file);
                return res.status(400).json({
                    ok: false,
                    mensaje: 'Debes escribir una descripción.'
                });
            }

            if (descripcionNormalizada.length > 100) {

                return res.status(400).json({
                    ok: false,
                    mensaje:
                        'La descripción puede tener máximo 100 caracteres.'
                });
            }

            if (!ubicacionNormalizada || ubicacionNormalizada.length > 300) {
                eliminarArchivoTemporal(req.file);
                return res.status(400).json({
                    ok: false,
                    mensaje: 'Indica una ubicación válida de máximo 300 caracteres.'
                });
            }

            if (!req.file) {

                return res.status(400).json({
                    ok: false,
                    mensaje:
                        'Debes adjuntar una foto del reporte.'
                });
            }

            /*
            La localidad no se recibe del cliente: se calcula con las
            coordenadas para que nadie pueda cambiarla. Se valida antes
            de escribir la imagen para no dejar archivos huérfanos.
            */
            const ubicacionGps = resolverLocalidad({ latitud, longitud });

            if (!ubicacionGps.ok) {

                return res.status(400).json({
                    ok: false,
                    mensaje: ubicacionGps.mensaje
                });
            }

            const latitudFinal = ubicacionGps.latitud;
            const longitudFinal = ubicacionGps.longitud;
            const localidadFinal = ubicacionGps.localidad;

            /*
            multer deja la foto en memoria (req.file.buffer).
            Se la pasamos a lib/almacen, que escribe en disco
            local o en Neon Object Storage segun la configuracion,
            y devuelve la ruta publica.
            */
            const extension = path
                .extname(req.file.originalname || '')
                .toLowerCase();

            const extensionValida = ['.jpg', '.jpeg', '.png', '.webp']
                .includes(extension)
                    ? extension
                    : '.jpg';

            const clave = await almacen.guardar(
                req.file.buffer,
                extensionValida
            );

            imagen_url = `/uploads/${clave}`;

            /*
            El servicio comprueba el límite diario y asigna operario
            dentro de una sola transacción. La ruta no repite esas
            reglas.
            */
            const { reporte, operarioAsignado } =
                await reportesService.crearReporteCiudadano({
                    usuarioId,
                    tipo: tipoNormalizado,
                    descripcion: descripcionNormalizada,
                    ubicacion: ubicacionNormalizada,
                    localidad: localidadFinal,
                    latitud: latitudFinal,
                    longitud: longitudFinal,
                    imagenUrl: imagen_url
                });

            /*
            Solo se registra el id: el objeto trae descripcion,
            ubicacion y coordenadas, que son datos del ciudadano.
            */
            console.log('Reporte creado:', reporte.id);

            emitirEvento('reporte_creado', {
                reporte_id: reporte.id,
                localidad: reporte.localidad,
                operario_id: reporte.operario_id
            }, {
                usuarios: operarioAsignado
                    ? [operarioAsignado.id]
                    : [],
                roles: ['admin'],
                empresaId: operarioAsignado?.empresa_id || null
            });

            /*
            Las dos listas de destinatarios son independientes: se
            resuelven en paralelo y después se notifica a todas en
            paralelo, tolerando fallos parciales.
            */
            /*
            La empresa solo recibe el aviso si el reporte quedó
            asignado a uno de sus operarios. Si sigue libre, solo
            administración lo ve hasta que se reparta.
            */
            const [destinatariosEmpresa, destinatariosAdmin] =
                await enParalelo([
                    () => operarioAsignado?.empresa_id
                        ? idsPorRol('empresa', {
                            empresaId: operarioAsignado.empresa_id
                        })
                        : Promise.resolve([]),
                    () => idsPorRol('admin')
                ]);

            const localityLabel = reporte.localidad || 'sin localidad';

            await enParaleloSeguro([
                () => notificarUsuarios(destinatariosEmpresa, {
                    tipo: 'reporte_nuevo',
                    titulo: 'Nuevo reporte recibido',
                    mensaje: `${reporte.tipo} en ${localityLabel}.`,
                    referenciaTipo: 'reporte',
                    referenciaId: reporte.id
                }),
                () => notificarUsuarios(destinatariosAdmin, {
                    tipo: 'reporte_nuevo',
                    titulo: 'Nuevo reporte en la plataforma',
                    mensaje: `${reporte.tipo} en ${localityLabel}.`,
                    referenciaTipo: 'reporte',
                    referenciaId: reporte.id
                }),
                ...(operarioAsignado
                    ? [() => notificarUsuarios([operarioAsignado.id], {
                        tipo: 'asignacion',
                        titulo: 'Te asignaron un reporte',
                        mensaje: `${reporte.tipo} en ${localityLabel}.`,
                        referenciaTipo: 'reporte',
                        referenciaId: reporte.id
                    })]
                    : [])
            ]);

            return res.status(201).json({
                ok: true,
                mensaje:
                    operarioAsignado
                        ? 'Reporte creado y asignado automáticamente.'
                        : 'Reporte creado correctamente.',
                reporte,
                operario_asignado:
                    operarioAsignado
            });

        } catch (error) {

            console.error(
                'ERROR CREANDO REPORTE:',
                error
            );

            /*
            Si la imagen ya se habia escrito y despues fallo algo
            (por ejemplo el INSERT), se borra para no dejar archivos
            huerfanos en el almacenamiento.
            */
            if (imagen_url) {
                try {
                    await almacen.eliminar(
                        imagen_url.replace(/^\/uploads\//, '')
                    );
                } catch (errorLimpieza) {
                    console.error(
                        'No se pudo limpiar la imagen huérfana:',
                        errorLimpieza
                    );
                }
            }

            if (esErrorServicio(error)) {
                return res.status(error.estado).json({
                    ok: false,
                    mensaje: error.message
                });
            }

            return res.status(500).json({
                ok: false,
                mensaje: 'Error al crear el reporte.'
            });
        }
    }
);

module.exports = router;
