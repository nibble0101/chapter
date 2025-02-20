import { Heading, VStack, Text, Spinner } from '@chakra-ui/react';
import { NextPage } from 'next';
import React from 'react';
import { EventCard } from 'components/EventCard';
import { useChapterQuery } from 'generated/graphql';
import { useParam } from 'hooks/useParam';

export const ChapterPage: NextPage = () => {
  const id = useParam('chapterId');

  const { loading, error, data } = useChapterQuery({
    variables: { id: id || -1 },
  });

  if (loading) {
    return <Spinner />;
  }

  if (error || !data?.chapter) {
    return (
      <div>
        <h1>error...</h1>
        <h2>{error?.message}</h2>
      </div>
    );
  }

  return (
    <VStack>
      <Heading as="h1">{data.chapter.name}</Heading>
      <Text>{data.chapter.description}</Text>

      <Heading size="md">Events:</Heading>
      <VStack w={['60%', '90%', '60%']} maxW="800px">
        {data.chapter.events.map((event) => (
          <EventCard
            key={event.id}
            event={{
              ...event,
              // Fix this | undefined
              chapter: { id, name: data.chapter?.name || '' },
            }}
          />
        ))}
      </VStack>
    </VStack>
  );
};
