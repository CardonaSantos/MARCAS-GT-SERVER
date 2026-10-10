import { createHash, createHmac } from 'node:crypto';
import { FileStoragePort } from '../../domain/ports/file-storage.port';

type SpacesOptions = {
  region: string;
  endpoint: string;
  key: string;
  secret: string;
  bucket: string;
};

/**
 * Cliente S3 SigV4 ligero, sin dependencias adicionales ni CDN pública.
 * API compatible con DigitalOcean Spaces (path-style).
 */
export class SpacesStorageAdapter implements FileStoragePort {
  constructor(private readonly config: SpacesOptions) {}

  async put(input: { key: string; body: Buffer; contentType: string }): Promise<void> {
    const uri = this.objectUri(input.key);
    const now = new Date();
    const date = timestamp(now);
    const payloadHash = sha256(input.body);
    const headers: Record<string, string> = {
      'content-type': input.contentType,
      'host': new URL(this.config.endpoint).host,
      'x-amz-acl': 'private',
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': date,
    };
    const signed = this.sign('PUT', uri, '', headers, payloadHash, date);
    const response = await fetch(this.absoluteUrl(uri), {
      method: 'PUT',
      headers: { ...headers, authorization: signed },
      body: new Uint8Array(input.body),
    });
    await assertS3Response(response, 'subir');
  }

  async remove(key: string): Promise<void> {
    const uri = this.objectUri(key);
    const date = timestamp(new Date());
    const headers = {
      host: new URL(this.config.endpoint).host,
      'x-amz-content-sha256': sha256(''),
      'x-amz-date': date,
    };
    const signed = this.sign('DELETE', uri, '', headers, sha256(''), date);
    const response = await fetch(this.absoluteUrl(uri), {
      method: 'DELETE',
      headers: { ...headers, authorization: signed },
    });
    await assertS3Response(response, 'eliminar');
  }

  async signedReadUrl(key: string, expiresSeconds = 60): Promise<string> {
    if (!Number.isInteger(expiresSeconds) || expiresSeconds < 1 || expiresSeconds > 300) {
      throw new Error('La vigencia de lectura debe estar entre 1 y 300 segundos.');
    }
    const date = timestamp(new Date());
    const scope = credentialScope(date, this.config.region);
    const uri = this.objectUri(key);
    const host = new URL(this.config.endpoint).host;
    const params: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': this.config.key + '/' + scope,
      'X-Amz-Date': date,
      'X-Amz-Expires': String(expiresSeconds),
      'X-Amz-SignedHeaders': 'host',
    };
    const query = canonicalQuery(params);
    const request = ['GET', uri, query, 'host:' + host + '\n',
      'host', 'UNSIGNED-PAYLOAD'].join('\n');
    const signature = this.signature(request, date);
    return this.absoluteUrl(uri) + '?' + query + '&X-Amz-Signature=' + signature;
  }

  private sign(
    method: string,
    uri: string,
    query: string,
    headers: Record<string, string>,
    bodyHash: string,
    date: string,
  ): string {
    const names = Object.keys(headers).sort();
    const canonHeaders = names.map((name) => name + ':' + headers[name].trim() + '\n').join('');
    const request = [
      method, uri, query, canonHeaders, names.join(';'), bodyHash,
    ].join('\n');
    return 'AWS4-HMAC-SHA256 Credential=' + this.config.key + '/' +
      credentialScope(date, this.config.region) +
      ', SignedHeaders=' + names.join(';') +
      ', Signature=' + this.signature(request, date);
  }

  private signature(request: string, date: string): string {
    const day = date.slice(0, 8);
    const kDay = hmac('AWS4' + this.config.secret, day);
    const kRegion = hmac(kDay, this.config.region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    const toSign = ['AWS4-HMAC-SHA256', date,
      credentialScope(date, this.config.region), sha256(request)].join('\n');
    return hmac(kSigning, toSign).toString('hex');
  }

  private objectUri(key: string): string {
    if (!/^marcas-gt\/empresas\/\d+\/[a-z0-9/.-]+$/.test(key) ||
        key.includes('..')) {
      throw new Error('Ruta de archivo no permitida.');
    }
    return '/' + encodeURIComponent(this.config.bucket) + '/' +
      key.split('/').map(encodeURIComponent).join('/');
  }

  private absoluteUrl(uri: string): string {
    return this.config.endpoint.replace(/\/+$/, '') + uri;
  }
}

function timestamp(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}
function credentialScope(date: string, region: string): string {
  return date.slice(0, 8) + '/' + region + '/s3/aws4_request';
}
function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}
function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}
function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params).sort()
    .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
    .join('&');
}
async function assertS3Response(response: Response, verb: string): Promise<void> {
  if (!response.ok) {
    // El XML puede contener identificadores y detalles internos. No exponerlo.
    throw new Error('DigitalOcean Spaces no pudo ' + verb +
      ' el archivo (HTTP ' + response.status + ').');
  }
}
