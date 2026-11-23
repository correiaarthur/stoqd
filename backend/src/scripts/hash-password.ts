/**
 * Gera o hash de uma senha para guardar em ADMIN_PASSWORD_HASH.
 *
 *   npm run hash-password -- "a-senha-do-admin"
 *
 * Sem a variável, o servidor sobe gerando o hash de ADMIN_PASSWORD a cada
 * reinício e avisa no log — funciona, mas mantém a senha em texto puro no
 * ambiente.
 */
import bcrypt from 'bcryptjs';
import { BCRYPT_ROUNDS } from '../lib/adminCredentials.js';

const password = process.argv[2];

if (!password) {
  console.error('Uso: npm run hash-password -- "sua-senha"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);

console.log('\nGuarde no .env (as aspas fazem parte):\n');
console.log(`ADMIN_PASSWORD_HASH="${hash}"\n`);
