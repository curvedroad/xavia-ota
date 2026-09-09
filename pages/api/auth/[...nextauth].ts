import NextAuth from 'next-auth';

import { authOptions } from '../../../apiUtils/security/auth';

export default NextAuth(authOptions);
