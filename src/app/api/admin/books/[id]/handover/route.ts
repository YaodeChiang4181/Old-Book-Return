import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const book = await prisma.book.findUnique({
      where: { id: params.id },
    });

    if (!book || book.status !== 'RESERVED') {
      return NextResponse.json({ error: 'Book is not reserved' }, { status: 400 });
    }

    await prisma.book.update({
      where: { id: params.id },
      data: { status: 'CLAIMED' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Handover error:', error);
    return NextResponse.json({ error: 'Failed to complete handover' }, { status: 500 });
  }
}
