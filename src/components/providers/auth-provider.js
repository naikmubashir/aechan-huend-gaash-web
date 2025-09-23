"use client";

import PropTypes from "prop-types";
import { SessionProvider } from "next-auth/react";

export default function AuthProvider({ children, session }) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
  session: PropTypes.object,
};
