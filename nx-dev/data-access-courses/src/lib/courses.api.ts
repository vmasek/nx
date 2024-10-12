import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { extractFrontmatter } from '@nx/nx-dev/ui-markdoc';
import { readFileSync } from 'fs';
import type { BlogAuthor } from '@nx/nx-dev/data-access-documents/node-only';

export interface Course {
  id: string;
  title: string;
  description: string;
  content: string;
  authors: BlogAuthor[];
  repository?: string;
  lessons: Lesson[];
  filePath: string;
  totalDuration: string;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
  duration: string;
  filePath: string;
}

function calculateTotalDuration(lessons: Lesson[]): string {
  const totalMinutes = lessons.reduce((total, lesson) => {
    if (!lesson.duration) return total;
    const [minutes, seconds] = lesson.duration.split(':').map(Number);
    return total + minutes + seconds / 60;
  }, 0);

  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export class CoursesApi {
  constructor(
    private readonly options: {
      coursesRoot: string;
    }
  ) {
    if (!options.coursesRoot) {
      throw new Error('courses root cannot be undefined');
    }
  }

  async getAllCourses(): Promise<Course[]> {
    const courseFolders = await readdir(this.options.coursesRoot);
    const courses = await Promise.all(
      courseFolders.map((folder) => this.getCourse(folder))
    );
    return courses;
  }

  // TODO: move to shared lib
  private readonly blogRoot = 'public/documentation/blog';

  async getCourse(folderName: string): Promise<Course> {
    const authors = JSON.parse(
      readFileSync(join(this.blogRoot, 'authors.json'), 'utf8')
    );
    const coursePath = join(this.options.coursesRoot, folderName);
    const courseFilePath = join(coursePath, 'course.md');

    const content = await readFile(courseFilePath, 'utf-8');
    const frontmatter = extractFrontmatter(content);

    const lessonFolders = await readdir(coursePath);
    const lessons = await Promise.all(
      lessonFolders
        .filter((folder) => folder !== 'course.md')
        .map((folder) => this.getLessons(folderName, folder))
    );
    const flattenedLessons = lessons.flat();

    return {
      id: folderName,
      title: frontmatter.title,
      description: frontmatter.description,
      content,
      authors: authors.filter((author: { name: string }) =>
        frontmatter.authors.includes(author.name)
      ),
      repository: frontmatter.repository,
      lessons: flattenedLessons,
      filePath: courseFilePath,
      totalDuration: calculateTotalDuration(flattenedLessons),
    };
  }

  private async getLessons(
    courseId: string,
    lessonFolder: string
  ): Promise<Lesson[]> {
    const lessonPath = join(this.options.coursesRoot, courseId, lessonFolder);
    const lessonFiles = await readdir(lessonPath);

    const lessons = await Promise.all(
      lessonFiles.map(async (file) => {
        if (!file.endsWith('.md')) return null;
        const filePath = join(lessonPath, file);
        const content = await readFile(filePath, 'utf-8');
        const frontmatter = extractFrontmatter(content);
        if (!frontmatter || !frontmatter.title) {
          throw new Error(`Lesson ${lessonFolder}/${file} has no title`);
        }
        return {
          id: `${lessonFolder}-${file.replace('.md', '')}`,
          title: frontmatter.title,
          description: content,
          videoUrl: frontmatter.videoUrl || null,
          duration: frontmatter.duration || null,
          filePath,
        };
      })
    );

    return lessons.filter((lesson): lesson is Lesson => lesson !== null);
  }
}
