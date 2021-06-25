import { Resolver, Query, Arg, Int, Mutation, Ctx } from 'type-graphql';
import { MoreThan } from 'typeorm';
import { CalendarEvent, google, outlook } from 'calendar-link';
import MailerService from 'server/services/MailerService';
import { GQLCtx } from 'server/ts/gql';
import { Event, Venue, Chapter, Rsvp } from '../../models';
import { CreateEventInputs, UpdateEventInputs } from './inputs';

@Resolver()
export class EventResolver {
  @Query(() => [Event])
  events(
    @Arg('limit', () => Int, { nullable: true }) limit?: number,
    @Arg('showAll', { nullable: true }) showAll?: boolean,
  ) {
    return Event.find({
      relations: ['chapter', 'tags', 'venue', 'rsvps', 'rsvps.user'],
      take: limit,
      order: {
        start_at: 'ASC',
      },
      where: {
        ...(!showAll && { start_at: MoreThan(new Date()) }),
      },
    });
  }

  @Query(() => [Event])
  async paginatedEvents(
    @Arg('limit', () => Int, { nullable: true }) limit?: number,
    @Arg('offset', () => Int, { nullable: true }) offset?: number,
  ): Promise<Event[]> {
    return await Event.find({
      relations: ['chapter', 'tags', 'venue', 'rsvps', 'rsvps.user'],
      order: {
        start_at: 'ASC',
      },
      take: limit || 10,
      skip: offset,
    });
  }

  @Query(() => Event, { nullable: true })
  event(@Arg('id', () => Int) id: number) {
    return Event.findOne(id, {
      relations: [
        'chapter',
        'tags',
        'venue',
        'rsvps',
        'rsvps.user',
        'organizer',
      ],
    });
  }

  @Mutation(() => Rsvp, { nullable: true })
  async rsvpEvent(
    @Arg('id', () => Int) id: number,
    @Ctx() ctx: GQLCtx,
  ): Promise<Rsvp | null> {
    if (!ctx.user) {
      throw new Error('You need to be logged in');
    }

    const event = await Event.findOne(id, {
      relations: ['organizer'],
    });
    if (!event) {
      throw new Error('Event not found');
    }

    let rsvp = await Rsvp.findOne({
      where: { event: { id: id }, user: { id: ctx.user.id } },
    });

    if (rsvp) {
      await rsvp.remove();
      return null;
    }

    rsvp = new Rsvp({
      event,
      user: ctx.user,
      date: new Date(),
      interested: false, // TODO handle this
      on_waitlist: false, // TODO handle this
    });

    await rsvp.save();
    const linkDetails: CalendarEvent = {
      title: event.name,
      start: event.start_at,
      end: event.ends_at,
      description: event.description,
    };
    if (event.venue?.name) linkDetails.location = event.venue?.name;

    new MailerService(
      [ctx.user.email],
      `Invitation: ${event.name}`,
      `Hi ${ctx.user.first_name},</br>
To add this event to your calendar(s) you can use these links:
</br>
<a href=${google(linkDetails)}>Google</a>
</br>
<a href=${outlook(linkDetails)}>Outlook</a>
      `,
    ).sendEmail();

    await new MailerService(
      [event.organizer.email],
      `New RSVP for ${event.name}`,
      `User ${ctx.user.first_name} ${ctx.user.last_name} has RSVP'd.`,
    ).sendEmail();

    return rsvp;
  }

  @Mutation(() => Event)
  async createEvent(@Arg('data') data: CreateEventInputs, @Ctx() ctx: GQLCtx) {
    if (!ctx.user) throw Error('User must be logged in to create events');
    let venue;
    if (data.venueId) {
      venue = await Venue.findOne(data.venueId);
      if (!venue) throw new Error('Venue missing');
    }

    const chapter = await Chapter.findOne(data.chapterId);
    if (!chapter) throw new Error('Chapter missing');

    // TODO: add admin and owner once those roles exist.
    const allowedRoles = ['organizer'];
    const hasPermission =
      ctx.user.chapter_roles.findIndex(
        ({ chapter_id, role_name }) =>
          chapter_id === data.chapterId && allowedRoles.includes(role_name),
      ) !== -1;

    if (!hasPermission)
      throw Error('User does not have permission to create events');

    const event = new Event({
      ...data,
      start_at: new Date(data.start_at),
      ends_at: new Date(data.ends_at),
      venue,
      chapter,
      organizer: ctx.user,
    });

    return event.save();
  }

  @Mutation(() => Event)
  async updateEvent(
    @Arg('id', () => Int) id: number,
    @Arg('data') data: UpdateEventInputs,
  ) {
    const event = await Event.findOne(id);
    if (!event) throw new Error('Cant find event');

    // TODO: Handle tags
    event.tags = [];

    event.name = data.name ?? event.name;
    event.description = data.description ?? event.description;
    event.url = data.url ?? event.url;
    event.video_url = data.video_url ?? event.video_url;
    event.venue_type = data.venue_type ?? event.venue_type;
    event.start_at = new Date(data.start_at) ?? event.start_at;
    event.ends_at = new Date(data.ends_at) ?? event.ends_at;
    event.capacity = data.capacity ?? event.capacity;

    if (data.venueId) {
      const venue = await Venue.findOne(data.venueId);
      if (!venue) throw new Error('Cant find venue');
      event.venue = venue;
    }
    return event.save();
  }

  @Mutation(() => Event)
  async cancelEvent(@Arg('id', () => Int) id: number) {
    const event = await Event.findOne(id);
    if (!event) throw new Error('Cant find event');

    event.canceled = true;

    return event.save();
  }

  @Mutation(() => Boolean)
  async deleteEvent(@Arg('id', () => Int) id: number) {
    const event = await Event.findOne(id);

    if (!event) throw new Error('Cant find event');

    await event.remove();

    return true;
  }

  @Mutation(() => Boolean)
  async sendEventInvite(@Arg('id', () => Int) id: number) {
    const event = await Event.findOne(id, {
      relations: ['venue', 'chapter', 'chapter.users', 'chapter.users.user'],
    });

    if (!event) throw new Error("Can't find event");

    // TODO: the default should probably be to bcc everyone.
    const addresses = event.chapter.users
      .filter((role) => role.interested)
      .map(({ user }) => user.email);
    const subject = `Invitation to ${event.name}.`;

    const chapterURL = `${process.env.CLIENT_LOCATION}/chapters/${event.chapter.id}`;
    const eventURL = `${process.env.CLIENT_LOCATION}/events/${event.id}`;
    // TODO: this needs to include an ical file
    // TODO: it needs a link to unsubscribe from just this event.  See
    // https://github.com/freeCodeCamp/chapter/issues/276#issuecomment-596913322
    const body =
      `When: ${event.start_at} to ${event.ends_at}<br>` +
      (event.venue ? `Where: ${event.venue?.name}<br>` : '') +
      `Event Details: <a href="${eventURL}">${eventURL}</a><br>
<br>
- Cancel your RSVP: <a href="${eventURL}">${eventURL}</a><br>
- More about ${event.chapter.name} or to unfollow this chapter: <a href="${chapterURL}">${chapterURL}</a><br>
<br>
----------------------------<br>
You received this email because you follow this chapter.<br>
<br>
See the options above to change your notifications.`;

    await new MailerService(addresses, subject, body).sendEmail();

    return true;
  }
}
