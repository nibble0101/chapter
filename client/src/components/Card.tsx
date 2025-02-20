import { Box, BoxProps } from '@chakra-ui/react';
import React from 'react';

export const Card: React.FC<BoxProps> = ({ children, ...rest }) => {
  return (
    <Box p="4" borderWidth="1px" borderRadius="lg" overflow="hidden" {...rest}>
      {children}
    </Box>
  );
};
